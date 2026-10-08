import { eq } from "drizzle-orm";
import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import {
  accounts,
  bookmarkAssets,
  bookmarkLinks,
  bookmarks,
  sessions,
  users,
} from "@karakeep/db/schema";
import { QueuePriority } from "@karakeep/shared-server";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import {
  CREDENTIAL_PROVIDER_ID,
  hasPassword,
  verifyUserPassword,
} from "../auth";
import {
  buildTestContext,
  createTestUser,
  getApiCaller,
  getApiKeyCallerForPlainKey,
  getTestQueueMocks,
} from "../testUtils";

const testQueueMocks = getTestQueueMocks();

const adminJobMocks = vi.hoisted(() => ({
  searchClearIndex: vi.fn(async () => undefined),
  vectorClearIndex: vi.fn(async () => undefined),
  getSearchClient: vi.fn(),
  getVectorStoreClient: vi.fn(),
}));

vi.mock("@karakeep/shared/search", () => ({
  getSearchClient: adminJobMocks.getSearchClient,
}));

vi.mock("@karakeep/shared/vectorStore", () => ({
  getVectorStoreClient: adminJobMocks.getVectorStoreClient,
}));

beforeEach<CustomTestContext>(async (context) => {
  vi.clearAllMocks();
  const testContext = await buildTestContext(true);
  Object.assign(context, testContext);
});

describe("Admin Routes", () => {
  describe("bulk bookmark jobs", () => {
    const now = new Date("2026-07-26T12:00:00.000Z");

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      adminJobMocks.getSearchClient.mockResolvedValue({
        clearIndex: adminJobMocks.searchClearIndex,
      });
      adminJobMocks.getVectorStoreClient.mockResolvedValue({
        clearIndex: adminJobMocks.vectorClearIndex,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function getAdminApi(db: CustomTestContext["db"]) {
      const [adminUser] = await db
        .insert(users)
        .values({
          name: "Admin User",
          email: "bulk-jobs-admin@test.com",
          role: "admin",
        })
        .returning();
      return getApiCaller(db, adminUser.id, adminUser.email, "admin").admin;
    }

    async function setModifiedAt(
      db: CustomTestContext["db"],
      bookmarkId: string,
      modifiedAt: Date,
    ) {
      await db
        .update(bookmarks)
        .set({ modifiedAt })
        .where(eq(bookmarks.id, bookmarkId));
    }

    test<CustomTestContext>("combines modifiedWithinSeconds with the inference status filter", async ({
      apiCallers,
      db,
    }) => {
      const adminApi = await getAdminApi(db);
      const [oldPending, recentPending, recentSuccess] = await Promise.all([
        apiCallers[0].bookmarks.createBookmark({
          text: "old pending",
          type: BookmarkTypes.TEXT,
        }),
        apiCallers[0].bookmarks.createBookmark({
          text: "recent pending",
          type: BookmarkTypes.TEXT,
        }),
        apiCallers[0].bookmarks.createBookmark({
          text: "recent success",
          type: BookmarkTypes.TEXT,
        }),
      ]);
      await Promise.all([
        setModifiedAt(
          db,
          oldPending.id,
          new Date(now.getTime() - 2 * 60 * 60 * 1000),
        ),
        setModifiedAt(
          db,
          recentPending.id,
          new Date(now.getTime() - 30 * 60 * 1000),
        ),
        db
          .update(bookmarks)
          .set({
            modifiedAt: new Date(now.getTime() - 30 * 60 * 1000),
            taggingStatus: "success",
          })
          .where(eq(bookmarks.id, recentSuccess.id)),
      ]);
      testQueueMocks.openAIEnqueue.mockClear();

      await adminApi.reRunInferenceOnAllBookmarks({
        type: "tag",
        status: "pending",
        modifiedWithinSeconds: 60 * 60,
      });

      expect(testQueueMocks.openAIEnqueue).toHaveBeenCalledTimes(1);
      expect(testQueueMocks.openAIEnqueue).toHaveBeenCalledWith(
        { bookmarkId: recentPending.id, type: "tag" },
        { priority: QueuePriority.Low },
      );
    });

    test<CustomTestContext>("filters recrawls using the bookmark modified date", async ({
      apiCallers,
      db,
    }) => {
      const adminApi = await getAdminApi(db);
      const [oldLink, recentLink] = await Promise.all([
        apiCallers[0].bookmarks.createBookmark({
          url: "https://old.example.com",
          type: BookmarkTypes.LINK,
        }),
        apiCallers[0].bookmarks.createBookmark({
          url: "https://recent.example.com",
          type: BookmarkTypes.LINK,
        }),
      ]);
      await Promise.all([
        setModifiedAt(
          db,
          oldLink.id,
          new Date(now.getTime() - 2 * 60 * 60 * 1000),
        ),
        setModifiedAt(
          db,
          recentLink.id,
          new Date(now.getTime() - 30 * 60 * 1000),
        ),
      ]);
      testQueueMocks.lowPriorityCrawlerEnqueue.mockClear();

      await adminApi.recrawlLinks({
        crawlStatus: "all",
        runInference: false,
        modifiedWithinSeconds: 60 * 60,
      });

      expect(testQueueMocks.lowPriorityCrawlerEnqueue).toHaveBeenCalledTimes(1);
      expect(testQueueMocks.lowPriorityCrawlerEnqueue).toHaveBeenCalledWith(
        {
          bookmarkId: recentLink.id,
          runInference: false,
        },
        expect.objectContaining({
          priority: QueuePriority.Low,
        }),
      );
    });

    test<CustomTestContext>("preserves the search index for a time-limited reindex", async ({
      apiCallers,
      db,
    }) => {
      const adminApi = await getAdminApi(db);
      const [oldBookmark, recentBookmark] = await Promise.all([
        apiCallers[0].bookmarks.createBookmark({
          text: "old",
          type: BookmarkTypes.TEXT,
        }),
        apiCallers[0].bookmarks.createBookmark({
          text: "recent",
          type: BookmarkTypes.TEXT,
        }),
      ]);
      await Promise.all([
        setModifiedAt(
          db,
          oldBookmark.id,
          new Date(now.getTime() - 2 * 60 * 60 * 1000),
        ),
        setModifiedAt(
          db,
          recentBookmark.id,
          new Date(now.getTime() - 30 * 60 * 1000),
        ),
      ]);
      testQueueMocks.triggerSearchReindex.mockClear();

      await adminApi.reindexAllBookmarks({
        modifiedWithinSeconds: 60 * 60,
      });

      expect(adminJobMocks.getSearchClient).not.toHaveBeenCalled();
      expect(testQueueMocks.triggerSearchReindex).toHaveBeenCalledTimes(1);
      expect(testQueueMocks.triggerSearchReindex).toHaveBeenCalledWith(
        recentBookmark.id,
        { priority: QueuePriority.Low },
      );
    });

    test<CustomTestContext>("preserves the vector index for time-limited embedding regeneration", async ({
      apiCallers,
      db,
    }) => {
      const adminApi = await getAdminApi(db);
      const [oldBookmark, recentBookmark] = await Promise.all([
        apiCallers[0].bookmarks.createBookmark({
          text: "old",
          type: BookmarkTypes.TEXT,
        }),
        apiCallers[0].bookmarks.createBookmark({
          text: "recent",
          type: BookmarkTypes.TEXT,
        }),
      ]);
      await Promise.all([
        setModifiedAt(
          db,
          oldBookmark.id,
          new Date(now.getTime() - 2 * 60 * 60 * 1000),
        ),
        setModifiedAt(
          db,
          recentBookmark.id,
          new Date(now.getTime() - 30 * 60 * 1000),
        ),
      ]);
      testQueueMocks.embeddingsEnqueue.mockClear();

      await adminApi.regenerateAllBookmarkEmbeddings({
        status: "all",
        modifiedWithinSeconds: 60 * 60,
      });

      expect(adminJobMocks.getVectorStoreClient).not.toHaveBeenCalled();
      expect(testQueueMocks.embeddingsEnqueue).toHaveBeenCalledTimes(1);
      expect(testQueueMocks.embeddingsEnqueue).toHaveBeenCalledWith(
        {
          bookmarkId: recentBookmark.id,
          type: "embed",
          force: true,
          runTaggingOnComplete: false,
        },
        {
          priority: QueuePriority.Low,
          groupId: "admin",
        },
      );
    });

    test<CustomTestContext>("filters asset reprocessing using the bookmark modified date", async ({
      apiCallers,
      db,
    }) => {
      const adminApi = await getAdminApi(db);
      const [oldAsset, recentAsset] = await Promise.all([
        apiCallers[0].bookmarks.createBookmark({
          text: "old asset",
          type: BookmarkTypes.TEXT,
        }),
        apiCallers[0].bookmarks.createBookmark({
          text: "recent asset",
          type: BookmarkTypes.TEXT,
        }),
      ]);
      await db.insert(bookmarkAssets).values([
        {
          id: oldAsset.id,
          assetId: "old-asset-id",
          assetType: "image",
        },
        {
          id: recentAsset.id,
          assetId: "recent-asset-id",
          assetType: "image",
        },
      ]);
      await Promise.all([
        setModifiedAt(
          db,
          oldAsset.id,
          new Date(now.getTime() - 2 * 60 * 60 * 1000),
        ),
        setModifiedAt(
          db,
          recentAsset.id,
          new Date(now.getTime() - 30 * 60 * 1000),
        ),
      ]);
      testQueueMocks.assetPreprocessingEnqueue.mockClear();

      await adminApi.reprocessAssetsFixMode({
        modifiedWithinSeconds: 60 * 60,
      });

      expect(testQueueMocks.assetPreprocessingEnqueue).toHaveBeenCalledTimes(1);
      expect(testQueueMocks.assetPreprocessingEnqueue).toHaveBeenCalledWith(
        {
          bookmarkId: recentAsset.id,
          fixMode: true,
        },
        { priority: QueuePriority.Low },
      );
    });

    test<CustomTestContext>("keeps the existing unbounded reindex behavior", async ({
      apiCallers,
      db,
    }) => {
      const adminApi = await getAdminApi(db);
      const [firstBookmark, secondBookmark] = await Promise.all([
        apiCallers[0].bookmarks.createBookmark({
          text: "first",
          type: BookmarkTypes.TEXT,
        }),
        apiCallers[0].bookmarks.createBookmark({
          text: "second",
          type: BookmarkTypes.TEXT,
        }),
      ]);
      testQueueMocks.triggerSearchReindex.mockClear();
      testQueueMocks.embeddingsEnqueue.mockClear();

      await adminApi.reindexAllBookmarks();
      await adminApi.regenerateAllBookmarkEmbeddings({ status: "all" });

      expect(adminJobMocks.searchClearIndex).toHaveBeenCalledTimes(1);
      expect(adminJobMocks.vectorClearIndex).toHaveBeenCalledTimes(1);
      expect(
        testQueueMocks.triggerSearchReindex.mock.calls
          .map(([bookmarkId]) => bookmarkId)
          .sort(),
      ).toEqual([firstBookmark.id, secondBookmark.id].sort());
      expect(
        testQueueMocks.embeddingsEnqueue.mock.calls
          .map(([payload]) => payload.bookmarkId)
          .sort(),
      ).toEqual([firstBookmark.id, secondBookmark.id].sort());
    });
  });

  test<CustomTestContext>("admin API key uses granular admin scopes", async ({
    apiCallers,
    db,
  }) => {
    const [adminUser] = await db
      .insert(users)
      .values({
        name: "Admin User",
        email: "admin-scoped@test.com",
        role: "admin",
      })
      .returning();
    const adminApi = getApiCaller(db, adminUser.id, adminUser.email, "admin");

    const bookmark = await apiCallers[0].bookmarks.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });

    const scopedKey = await adminApi.apiKeys.create({
      name: "Admin Read Bookmarks Key",
      scopes: ["admin:bookmarks:read"],
    });
    const apiKeyCaller = await getApiKeyCallerForPlainKey(db, scopedKey.key);

    const debugInfo = await apiKeyCaller.admin.getBookmarkDebugInfo({
      bookmarkId: bookmark.id,
    });
    expect(debugInfo.id).toEqual(bookmark.id);

    await expect(() =>
      apiKeyCaller.admin.adminRetagBookmark({ bookmarkId: bookmark.id }),
    ).rejects.toThrow(/FORBIDDEN|admin:bookmarks:readwrite/i);
  });

  describe("user management", () => {
    async function createAdmin(db: CustomTestContext["db"]) {
      const admin = await createTestUser(db, {
        name: "Admin User",
        email: "admin-users@test.com",
        password: "adminpass123",
        role: "admin",
      });
      return {
        admin,
        adminApi: getApiCaller(db, admin.id, admin.email, "admin"),
      };
    }

    async function createSession(
      db: CustomTestContext["db"],
      userId: string,
      token: string,
    ) {
      await db.insert(sessions).values({
        userId,
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    }

    test<CustomTestContext>("createUser creates a verified user with a password", async ({
      db,
    }) => {
      const { adminApi } = await createAdmin(db);

      const created = await adminApi.admin.createUser({
        name: "Created User",
        email: "Created@Test.com",
        password: "createdpass123",
        confirmPassword: "createdpass123",
        role: "user",
      });

      expect(created.email).toBe("created@test.com");
      expect(created.role).toBe("user");

      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, created.id),
      });
      expect(dbUser?.emailVerified).toBe(true);
      expect(await verifyUserPassword(db, created.id, "createdpass123")).toBe(
        true,
      );
    });

    test<CustomTestContext>("resetPassword changes the password and signs the user out", async ({
      db,
    }) => {
      const { admin, adminApi } = await createAdmin(db);
      const target = await createTestUser(db, {
        name: "Target User",
        email: "reset-target@test.com",
        password: "oldpass123",
      });
      await createSession(db, target.id, "target-session-1");
      await createSession(db, target.id, "target-session-2");
      await createSession(db, admin.id, "admin-session");

      await adminApi.admin.resetPassword({
        userId: target.id,
        newPassword: "newpass123",
        newPasswordConfirm: "newpass123",
      });

      expect(await verifyUserPassword(db, target.id, "newpass123")).toBe(true);
      expect(await verifyUserPassword(db, target.id, "oldpass123")).toBe(false);

      // Still a single credential account, updated in place
      const targetAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, target.id));
      expect(targetAccounts).toHaveLength(1);

      const targetSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, target.id));
      expect(targetSessions).toHaveLength(0);

      // Other users' sessions are untouched
      const adminSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, admin.id));
      expect(adminSessions.map((s) => s.token)).toEqual(["admin-session"]);
    });

    test<CustomTestContext>("resetPassword gives a password to a user without one", async ({
      db,
      apiCallers,
    }) => {
      const { adminApi } = await createAdmin(db);
      const { id: oauthUserId } = await apiCallers[0].users.whoami();
      expect(await hasPassword(db, oauthUserId)).toBe(false);

      await adminApi.admin.resetPassword({
        userId: oauthUserId,
        newPassword: "newpass123",
        newPasswordConfirm: "newpass123",
      });

      const credentialAccount = await db.query.accounts.findFirst({
        where: eq(accounts.userId, oauthUserId),
      });
      expect(credentialAccount?.providerId).toBe(CREDENTIAL_PROVIDER_ID);
      expect(credentialAccount?.accountId).toBe(oauthUserId);
      expect(await verifyUserPassword(db, oauthUserId, "newpass123")).toBe(
        true,
      );
    });

    test<CustomTestContext>("resetPassword refuses to reset own password", async ({
      db,
    }) => {
      const { admin, adminApi } = await createAdmin(db);
      await createSession(db, admin.id, "admin-session");

      await expect(() =>
        adminApi.admin.resetPassword({
          userId: admin.id,
          newPassword: "newpass123",
          newPasswordConfirm: "newpass123",
        }),
      ).rejects.toThrow(/Cannot reset own password/);

      expect(await verifyUserPassword(db, admin.id, "adminpass123")).toBe(true);
      const adminSessions = await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, admin.id));
      expect(adminSessions).toHaveLength(1);
    });

    test<CustomTestContext>("resetPassword fails for unknown users", async ({
      db,
    }) => {
      const { adminApi } = await createAdmin(db);

      await expect(() =>
        adminApi.admin.resetPassword({
          userId: "does-not-exist",
          newPassword: "newpass123",
          newPasswordConfirm: "newpass123",
        }),
      ).rejects.toThrow(/User not found/);

      const orphanAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, "does-not-exist"));
      expect(orphanAccounts).toHaveLength(0);
    });

    test<CustomTestContext>("non-admins cannot reset passwords", async ({
      db,
      apiCallers,
    }) => {
      const target = await createTestUser(db, {
        name: "Target User",
        email: "reset-target@test.com",
        password: "oldpass123",
      });

      await expect(() =>
        apiCallers[0].admin.resetPassword({
          userId: target.id,
          newPassword: "newpass123",
          newPasswordConfirm: "newpass123",
        }),
      ).rejects.toThrow(/FORBIDDEN/);

      expect(await verifyUserPassword(db, target.id, "oldpass123")).toBe(true);
    });
  });

  describe("getBookmarkDebugInfo", () => {
    test<CustomTestContext>("admin can access bookmark debug info for link bookmark", async ({
      apiCallers,
      db,
    }) => {
      // Create an admin user
      const adminUser = await db
        .insert(users)
        .values({
          name: "Admin User",
          email: "admin@test.com",
          role: "admin",
        })
        .returning();
      const adminApi = getApiCaller(
        db,
        adminUser[0].id,
        adminUser[0].email,
        "admin",
      );

      // Create a bookmark as a regular user
      const bookmark = await apiCallers[0].bookmarks.createBookmark({
        url: "https://example.com",
        type: BookmarkTypes.LINK,
      });

      // Update the bookmark link with some metadata
      await db
        .update(bookmarkLinks)
        .set({
          crawlStatus: "success",
          crawlStatusCode: 200,
          crawledAt: new Date(),
          htmlContent: "<html><body>Test content</body></html>",
          title: "Test Title",
          description: "Test Description",
        })
        .where(eq(bookmarkLinks.id, bookmark.id));

      // Admin should be able to access debug info
      const debugInfo = await adminApi.admin.getBookmarkDebugInfo({
        bookmarkId: bookmark.id,
      });

      expect(debugInfo.id).toEqual(bookmark.id);
      expect(debugInfo.type).toEqual(BookmarkTypes.LINK);
      expect(debugInfo.linkInfo).toBeDefined();
      assert(debugInfo.linkInfo);
      expect(debugInfo.linkInfo.url).toEqual("https://example.com");
      expect(debugInfo.linkInfo.crawlStatus).toEqual("success");
      expect(debugInfo.linkInfo.crawlStatusCode).toEqual(200);
      expect(debugInfo.linkInfo.hasHtmlContent).toEqual(true);
      expect(debugInfo.linkInfo.htmlContentPreview).toBeDefined();
      expect(debugInfo.linkInfo.htmlContentPreview).toContain("Test content");
    });

    test<CustomTestContext>("admin can access bookmark debug info for text bookmark", async ({
      apiCallers,
      db,
    }) => {
      // Create an admin user
      const adminUser = await db
        .insert(users)
        .values({
          name: "Admin User",
          email: "admin@test.com",
          role: "admin",
        })
        .returning();
      const adminApi = getApiCaller(
        db,
        adminUser[0].id,
        adminUser[0].email,
        "admin",
      );

      // Create a text bookmark
      const bookmark = await apiCallers[0].bookmarks.createBookmark({
        text: "This is a test text bookmark",
        type: BookmarkTypes.TEXT,
      });

      // Admin should be able to access debug info
      const debugInfo = await adminApi.admin.getBookmarkDebugInfo({
        bookmarkId: bookmark.id,
      });

      expect(debugInfo.id).toEqual(bookmark.id);
      expect(debugInfo.type).toEqual(BookmarkTypes.TEXT);
      expect(debugInfo.textInfo).toBeDefined();
      assert(debugInfo.textInfo);
      expect(debugInfo.textInfo.hasText).toEqual(true);
    });

    test<CustomTestContext>("admin can see bookmark tags in debug info", async ({
      apiCallers,
      db,
    }) => {
      // Create an admin user
      const adminUser = await db
        .insert(users)
        .values({
          name: "Admin User",
          email: "admin@test.com",
          role: "admin",
        })
        .returning();
      const adminApi = getApiCaller(
        db,
        adminUser[0].id,
        adminUser[0].email,
        "admin",
      );

      // Create a bookmark with tags
      const bookmark = await apiCallers[0].bookmarks.createBookmark({
        url: "https://example.com",
        type: BookmarkTypes.LINK,
      });

      // Add tags to the bookmark
      await apiCallers[0].bookmarks.updateTags({
        bookmarkId: bookmark.id,
        attach: [{ tagName: "test-tag-1" }, { tagName: "test-tag-2" }],
        detach: [],
      });

      // Admin should be able to see tags in debug info
      const debugInfo = await adminApi.admin.getBookmarkDebugInfo({
        bookmarkId: bookmark.id,
      });

      expect(debugInfo.tags).toHaveLength(2);
      expect(debugInfo.tags.map((t) => t.name).sort()).toEqual([
        "test-tag-1",
        "test-tag-2",
      ]);
      expect(debugInfo.tags[0].attachedBy).toEqual("human");
    });

    test<CustomTestContext>("non-admin user cannot access bookmark debug info", async ({
      apiCallers,
    }) => {
      // Create a bookmark
      const bookmark = await apiCallers[0].bookmarks.createBookmark({
        url: "https://example.com",
        type: BookmarkTypes.LINK,
      });

      // Non-admin user should not be able to access debug info
      // The admin procedure itself will throw FORBIDDEN
      await expect(() =>
        apiCallers[0].admin.getBookmarkDebugInfo({ bookmarkId: bookmark.id }),
      ).rejects.toThrow(/FORBIDDEN/);
    });

    test<CustomTestContext>("debug info includes asset URLs with signed tokens", async ({
      apiCallers,
      db,
    }) => {
      // Create an admin user
      const adminUser = await db
        .insert(users)
        .values({
          name: "Admin User",
          email: "admin@test.com",
          role: "admin",
        })
        .returning();
      const adminApi = getApiCaller(
        db,
        adminUser[0].id,
        adminUser[0].email,
        "admin",
      );

      // Create a bookmark
      const bookmark = await apiCallers[0].bookmarks.createBookmark({
        url: "https://example.com",
        type: BookmarkTypes.LINK,
      });

      // Get debug info
      const debugInfo = await adminApi.admin.getBookmarkDebugInfo({
        bookmarkId: bookmark.id,
      });

      // Check that assets array is present
      expect(debugInfo.assets).toBeDefined();
      expect(Array.isArray(debugInfo.assets)).toBe(true);

      // If there are assets, check that they have signed URLs
      if (debugInfo.assets.length > 0) {
        const asset = debugInfo.assets[0];
        expect(asset.url).toBeDefined();
        expect(asset.url).toContain("/api/public/assets/");
        expect(asset.url).toContain("token=");
      }
    });

    test<CustomTestContext>("debug info truncates HTML content preview", async ({
      apiCallers,
      db,
    }) => {
      // Create an admin user
      const adminUser = await db
        .insert(users)
        .values({
          name: "Admin User",
          email: "admin@test.com",
          role: "admin",
        })
        .returning();
      const adminApi = getApiCaller(
        db,
        adminUser[0].id,
        adminUser[0].email,
        "admin",
      );

      // Create a bookmark
      const bookmark = await apiCallers[0].bookmarks.createBookmark({
        url: "https://example.com",
        type: BookmarkTypes.LINK,
      });

      // Create a large HTML content
      const largeContent = "<html><body>" + "x".repeat(2000) + "</body></html>";
      await db
        .update(bookmarkLinks)
        .set({
          htmlContent: largeContent,
        })
        .where(eq(bookmarkLinks.id, bookmark.id));

      // Get debug info
      const debugInfo = await adminApi.admin.getBookmarkDebugInfo({
        bookmarkId: bookmark.id,
      });

      // Check that HTML preview is truncated to 1000 characters
      assert(debugInfo.linkInfo);
      expect(debugInfo.linkInfo.htmlContentPreview).toBeDefined();
      expect(debugInfo.linkInfo.htmlContentPreview!.length).toBeLessThanOrEqual(
        1000,
      );
    });
  });

  describe("purgeBookmarksOverQuota", () => {
    async function setup(
      db: CustomTestContext["db"],
      bookmarkQuota: number | null,
      numBookmarks: number,
    ) {
      const [adminUser] = await db
        .insert(users)
        .values({
          name: "Admin User",
          email: "purge-admin@test.com",
          role: "admin",
        })
        .returning();
      const [user] = await db
        .insert(users)
        .values({
          name: "Over Quota User",
          email: "over-quota@test.com",
          bookmarkQuota,
        })
        .returning();
      if (numBookmarks > 0) {
        await db.insert(bookmarks).values(
          Array.from(
            { length: numBookmarks },
            (): typeof bookmarks.$inferInsert => ({
              userId: user.id,
              type: BookmarkTypes.TEXT,
            }),
          ),
        );
      }
      return {
        adminApi: getApiCaller(db, adminUser.id, adminUser.email, "admin")
          .admin,
        user,
      };
    }

    test<CustomTestContext>("enqueues a purge for users over quota", async ({
      db,
    }) => {
      const { adminApi, user } = await setup(db, 2, 5);

      const res = await adminApi.purgeBookmarksOverQuota({ userId: user.id });

      expect(res).toEqual({
        numBookmarks: 5,
        bookmarkQuota: 2,
        numBookmarksToDelete: 3,
        enqueued: true,
      });
      expect(testQueueMocks.adminMaintenanceEnqueue).toHaveBeenCalledTimes(1);
      expect(testQueueMocks.adminMaintenanceEnqueue).toHaveBeenCalledWith({
        type: "purge_bookmarks_over_quota",
        args: { userId: user.id },
      });
    });

    test<CustomTestContext>("dry run doesn't enqueue anything", async ({
      db,
    }) => {
      const { adminApi, user } = await setup(db, 2, 5);

      const res = await adminApi.purgeBookmarksOverQuota({
        userId: user.id,
        dryRun: true,
      });

      expect(res.numBookmarksToDelete).toEqual(3);
      expect(res.enqueued).toEqual(false);
      expect(testQueueMocks.adminMaintenanceEnqueue).not.toHaveBeenCalled();
    });

    test<CustomTestContext>("doesn't enqueue for users within quota", async ({
      db,
    }) => {
      const { adminApi, user } = await setup(db, 5, 5);

      const res = await adminApi.purgeBookmarksOverQuota({ userId: user.id });

      expect(res.numBookmarksToDelete).toEqual(0);
      expect(res.enqueued).toEqual(false);
      expect(testQueueMocks.adminMaintenanceEnqueue).not.toHaveBeenCalled();
    });

    test<CustomTestContext>("rejects users without a quota and unknown users", async ({
      db,
    }) => {
      const { adminApi, user } = await setup(db, null, 5);

      await expect(() =>
        adminApi.purgeBookmarksOverQuota({ userId: user.id }),
      ).rejects.toThrow(/bookmark quota/);
      await expect(() =>
        adminApi.purgeBookmarksOverQuota({ userId: "does-not-exist" }),
      ).rejects.toThrow(/User not found/);
      expect(testQueueMocks.adminMaintenanceEnqueue).not.toHaveBeenCalled();
    });

    test<CustomTestContext>("non-admins can't purge", async ({
      apiCallers,
      db,
    }) => {
      const { user } = await setup(db, 2, 5);

      await expect(() =>
        apiCallers[0].admin.purgeBookmarksOverQuota({ userId: user.id }),
      ).rejects.toThrow(/FORBIDDEN/);
    });

    test<CustomTestContext>("can't be triggered through the generic maintenance endpoint", async ({
      db,
    }) => {
      const { adminApi, user } = await setup(db, 2, 5);

      const input: unknown = {
        type: "purge_bookmarks_over_quota",
        args: { userId: user.id },
      };
      await expect(() =>
        // @ts-expect-error purge isn't a system maintenance task
        adminApi.runAdminMaintenanceTask(input),
      ).rejects.toThrow();
      expect(testQueueMocks.adminMaintenanceEnqueue).not.toHaveBeenCalled();
    });
  });
});
