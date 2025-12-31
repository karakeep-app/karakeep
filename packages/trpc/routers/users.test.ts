import { eq } from "drizzle-orm";
import { assert, beforeEach, describe, expect, test, vi } from "vitest";

import {
  assets,
  AssetTypes,
  bookmarks,
  passwordResetTokens,
  users,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import * as emailModule from "../email";
import { defaultBeforeEach, getApiCaller } from "../testUtils";

// Mock server config with email settings
vi.mock("@karakeep/shared/config", async (original) => {
  const mod = (await original()) as typeof import("@karakeep/shared/config");
  return {
    ...mod,
    default: {
      ...mod.default,
      auth: {
        ...mod.default.auth,
        emailVerificationRequired: true,
      },
      email: {
        smtp: {
          host: "test-smtp.example.com",
          port: 587,
          secure: false,
          user: "test@example.com",
          password: "test-password",
          from: "test@example.com",
        },
      },
    },
  };
});

// Mock email functions
vi.mock("../email", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

beforeEach<CustomTestContext>(defaultBeforeEach(false));

describe("User Routes", () => {
  test<CustomTestContext>("create user", async ({ unauthedAPICaller }) => {
    const user = await unauthedAPICaller.users.create({
      name: "Test User",
      email: "test123@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    expect(user.name).toEqual("Test User");
    expect(user.email).toEqual("test123@test.com");
  });

  test<CustomTestContext>("first user is admin", async ({
    unauthedAPICaller,
  }) => {
    const user1 = await unauthedAPICaller.users.create({
      name: "Test User",
      email: "test123@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const user2 = await unauthedAPICaller.users.create({
      name: "Test User",
      email: "test124@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    expect(user1.role).toEqual("admin");
    expect(user2.role).toEqual("user");
  });

  test<CustomTestContext>("unique emails", async ({ unauthedAPICaller }) => {
    await unauthedAPICaller.users.create({
      name: "Test User",
      email: "test123@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    await expect(() =>
      unauthedAPICaller.users.create({
        name: "Test User",
        email: "test123@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      }),
    ).rejects.toThrow(/Email is already taken/);
  });

  test<CustomTestContext>("privacy checks", async ({
    db,
    unauthedAPICaller,
  }) => {
    const adminUser = await unauthedAPICaller.users.create({
      name: "Test User",
      email: "test123@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });
    const [user1, user2] = await Promise.all(
      ["test1234@test.com", "test12345@test.com"].map((e) =>
        unauthedAPICaller.users.create({
          name: "Test User",
          email: e,
          password: "pass1234",
          confirmPassword: "pass1234",
        }),
      ),
    );

    assert(adminUser.role == "admin");
    assert(user1.role == "user");
    assert(user2.role == "user");

    const user2Caller = getApiCaller(db, user2.id);

    // A normal user can't delete other users
    await expect(() =>
      user2Caller.users.delete({
        userId: user1.id,
      }),
    ).rejects.toThrow(/FORBIDDEN/);

    // A normal user can't list all users
    await expect(() => user2Caller.users.list()).rejects.toThrow(/FORBIDDEN/);
  });

  test<CustomTestContext>("get/update user settings", async ({
    db,
    unauthedAPICaller,
  }) => {
    const user = await unauthedAPICaller.users.create({
      name: "Test User",
      email: "testupdate@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });
    const caller = getApiCaller(db, user.id);

    const settings = await caller.users.settings();
    // The default settings
    expect(settings).toEqual({
      bookmarkClickAction: "open_original_link",
      archiveDisplayBehaviour: "show",
      timezone: "UTC",
      backupsEnabled: false,
      backupsFrequency: "weekly",
      backupsRetentionDays: 30,

      // Reader settings
      readerFontFamily: null,
      readerFontSize: null,
      readerLineHeight: null,

      // AI Settings
      autoSummarizationEnabled: null,
      autoTaggingEnabled: null,
      inferredTagLang: null,
      tagStyle: "titlecase-spaces",
    });

    // Update settings
    await caller.users.updateSettings({
      bookmarkClickAction: "expand_bookmark_preview",
      backupsEnabled: true,
      backupsFrequency: "daily",
      backupsRetentionDays: 7,

      // Reader settings
      readerFontFamily: "serif",
      readerFontSize: 12,
      readerLineHeight: 1.5,

      // AI Settings
      autoSummarizationEnabled: true,
      autoTaggingEnabled: true,
      inferredTagLang: "en",
      tagStyle: "lowercase-underscores",
    });

    // Verify updated settings
    const updatedSettings = await caller.users.settings();
    expect(updatedSettings).toEqual({
      bookmarkClickAction: "expand_bookmark_preview",
      archiveDisplayBehaviour: "show",
      timezone: "UTC",
      backupsEnabled: true,
      backupsFrequency: "daily",
      backupsRetentionDays: 7,

      // Reader settings
      readerFontFamily: "serif",
      readerFontSize: 12,
      readerLineHeight: 1.5,

      // AI Settings
      autoSummarizationEnabled: true,
      autoTaggingEnabled: true,
      inferredTagLang: "en",
      tagStyle: "lowercase-underscores",
    });

    // Test invalid update (e.g., empty input, if schema enforces it)
    await expect(() => caller.users.updateSettings({})).rejects.toThrow(
      /No settings provided/,
    );
  });

  test<CustomTestContext>("user stats - empty user", async ({
    db,
    unauthedAPICaller,
  }) => {
    const user = await unauthedAPICaller.users.create({
      name: "Test User",
      email: "stats@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });
    const caller = getApiCaller(db, user.id);

    const stats = await caller.users.stats();

    // All stats should be zero for a new user
    expect(stats.numBookmarks).toBe(0);
    expect(stats.numFavorites).toBe(0);
    expect(stats.numArchived).toBe(0);
    expect(stats.numTags).toBe(0);
    expect(stats.numLists).toBe(0);
    expect(stats.numHighlights).toBe(0);
    expect(stats.bookmarksByType).toEqual({ link: 0, text: 0, asset: 0 });
    expect(stats.topDomains).toEqual([]);
    expect(stats.totalAssetSize).toBe(0);
    expect(stats.assetsByType).toEqual([]);
    expect(stats.tagUsage).toEqual([]);
    expect(stats.bookmarkingActivity.thisWeek).toBe(0);
    expect(stats.bookmarkingActivity.thisMonth).toBe(0);
    expect(stats.bookmarkingActivity.thisYear).toBe(0);
    expect(stats.bookmarkingActivity.byHour).toHaveLength(24);
    expect(stats.bookmarkingActivity.byDayOfWeek).toHaveLength(7);

    // All hours and days should have 0 count
    stats.bookmarkingActivity.byHour.forEach((hour, index) => {
      expect(hour.hour).toBe(index);
      expect(hour.count).toBe(0);
    });
    stats.bookmarkingActivity.byDayOfWeek.forEach((day, index) => {
      expect(day.day).toBe(index);
      expect(day.count).toBe(0);
    });
  });

  test<CustomTestContext>("user stats - with data", async ({
    db,
    unauthedAPICaller,
  }) => {
    const user = await unauthedAPICaller.users.create({
      name: "Test User",
      email: "statsdata@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });
    const caller = getApiCaller(db, user.id);

    // Create test bookmarks
    const bookmark1 = await caller.bookmarks.createBookmark({
      url: "https://example.com/page1",
      type: BookmarkTypes.LINK,
    });

    const bookmark2 = await caller.bookmarks.createBookmark({
      url: "https://google.com/search",
      type: BookmarkTypes.LINK,
    });

    await caller.bookmarks.createBookmark({
      text: "Test note content",
      type: BookmarkTypes.TEXT,
    });

    // Create tags
    const tag1 = await caller.tags.create({ name: "tech" });
    const tag2 = await caller.tags.create({ name: "work" });

    // Create lists
    await caller.lists.create({
      name: "Test List",
      icon: "📚",
      type: "manual",
    });

    // Archive one bookmark
    await caller.bookmarks.updateBookmark({
      bookmarkId: bookmark1.id,
      archived: true,
    });

    // Favorite one bookmark
    await caller.bookmarks.updateBookmark({
      bookmarkId: bookmark2.id,
      favourited: true,
    });

    // Add tags to bookmarks
    await caller.bookmarks.updateTags({
      bookmarkId: bookmark1.id,
      attach: [{ tagId: tag1.id }],
      detach: [],
    });

    await caller.bookmarks.updateTags({
      bookmarkId: bookmark2.id,
      attach: [{ tagId: tag1.id }, { tagId: tag2.id }],
      detach: [],
    });

    // Create highlights
    await caller.highlights.create({
      bookmarkId: bookmark1.id,
      startOffset: 0,
      endOffset: 10,
      text: "highlighted text",
      note: "test note",
    });

    // Insert test assets directly into DB
    await db.insert(assets).values([
      {
        id: "asset1",
        assetType: AssetTypes.LINK_SCREENSHOT,
        size: 1024,
        contentType: "image/png",
        bookmarkId: bookmark1.id,
        userId: user.id,
      },
      {
        id: "asset2",
        assetType: AssetTypes.LINK_BANNER_IMAGE,
        size: 2048,
        contentType: "image/jpeg",
        bookmarkId: bookmark2.id,
        userId: user.id,
      },
    ]);

    const stats = await caller.users.stats();

    // Verify basic counts
    expect(stats.numBookmarks).toBe(3);
    expect(stats.numFavorites).toBe(1);
    expect(stats.numArchived).toBe(1);
    expect(stats.numTags).toBe(2);
    expect(stats.numLists).toBe(1);
    expect(stats.numHighlights).toBe(1);

    // Verify bookmark types
    expect(stats.bookmarksByType.link).toBe(2);
    expect(stats.bookmarksByType.text).toBe(1);
    expect(stats.bookmarksByType.asset).toBe(0);

    // Verify top domains
    expect(stats.topDomains).toHaveLength(2);
    expect(
      stats.topDomains.find((d) => d.domain === "example.com"),
    ).toBeTruthy();
    expect(
      stats.topDomains.find((d) => d.domain === "google.com"),
    ).toBeTruthy();

    // Verify asset stats
    expect(stats.totalAssetSize).toBe(3072); // 1024 + 2048
    expect(stats.assetsByType).toHaveLength(2);

    const screenshotAsset = stats.assetsByType.find(
      (a) => a.type === AssetTypes.LINK_SCREENSHOT,
    );
    expect(screenshotAsset?.count).toBe(1);
    expect(screenshotAsset?.totalSize).toBe(1024);

    const bannerAsset = stats.assetsByType.find(
      (a) => a.type === AssetTypes.LINK_BANNER_IMAGE,
    );
    expect(bannerAsset?.count).toBe(1);
    expect(bannerAsset?.totalSize).toBe(2048);

    // Verify tag usage
    expect(stats.tagUsage).toHaveLength(2);
    const techTag = stats.tagUsage.find((t) => t.name === "tech");
    const workTag = stats.tagUsage.find((t) => t.name === "work");
    expect(techTag?.count).toBe(2); // Used in 2 bookmarks
    expect(workTag?.count).toBe(1); // Used in 1 bookmark

    // Verify activity stats (should be > 0 since we just created bookmarks)
    expect(stats.bookmarkingActivity.thisWeek).toBe(3);
    expect(stats.bookmarkingActivity.thisMonth).toBe(3);
    expect(stats.bookmarkingActivity.thisYear).toBe(3);

    // Verify hour/day arrays are properly structured
    expect(stats.bookmarkingActivity.byHour).toHaveLength(24);
    expect(stats.bookmarkingActivity.byDayOfWeek).toHaveLength(7);
  });

  test<CustomTestContext>("user stats - privacy isolation", async ({
    db,
    unauthedAPICaller,
  }) => {
    // Create two users
    const user1 = await unauthedAPICaller.users.create({
      name: "User 1",
      email: "user1@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const user2 = await unauthedAPICaller.users.create({
      name: "User 2",
      email: "user2@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });

    const caller1 = getApiCaller(db, user1.id);
    const caller2 = getApiCaller(db, user2.id);

    // User 1 creates some bookmarks
    const bookmark1 = await caller1.bookmarks.createBookmark({
      url: "https://user1.com",
      type: BookmarkTypes.LINK,
    });

    const tag1 = await caller1.tags.create({ name: "user1tag" });

    // Attach tag to bookmark
    await caller1.bookmarks.updateTags({
      bookmarkId: bookmark1.id,
      attach: [{ tagId: tag1.id }],
      detach: [],
    });

    // User 2 creates different bookmarks
    const bookmark2 = await caller2.bookmarks.createBookmark({
      url: "https://user2.com",
      type: BookmarkTypes.LINK,
    });

    const tag2 = await caller2.tags.create({ name: "user2tag" });

    // Attach tag to bookmark
    await caller2.bookmarks.updateTags({
      bookmarkId: bookmark2.id,
      attach: [{ tagId: tag2.id }],
      detach: [],
    });

    // Get stats for both users
    const stats1 = await caller1.users.stats();
    const stats2 = await caller2.users.stats();

    // Each user should only see their own data
    expect(stats1.numBookmarks).toBe(1);
    expect(stats1.numTags).toBe(1);
    expect(stats1.topDomains[0]?.domain).toBe("user1.com");
    expect(stats1.tagUsage[0]?.name).toBe("user1tag");

    expect(stats2.numBookmarks).toBe(1);
    expect(stats2.numTags).toBe(1);
    expect(stats2.topDomains[0]?.domain).toBe("user2.com");
    expect(stats2.tagUsage[0]?.name).toBe("user2tag");

    // Users should not see each other's data
    expect(stats1.topDomains.find((d) => d.domain === "user2.com")).toBeFalsy();
    expect(stats2.topDomains.find((d) => d.domain === "user1.com")).toBeFalsy();
  });

  test<CustomTestContext>("user stats - activity time patterns", async ({
    db,
    unauthedAPICaller,
  }) => {
    const user = await unauthedAPICaller.users.create({
      name: "Test User",
      email: "timepatterns@test.com",
      password: "pass1234",
      confirmPassword: "pass1234",
    });
    const caller = getApiCaller(db, user.id);

    // Create bookmarks with specific timestamps
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Insert bookmarks directly with specific timestamps
    await db
      .insert(bookmarks)
      .values([
        {
          userId: user.id,
          type: BookmarkTypes.LINK,
          createdAt: now,
          archived: false,
          favourited: false,
        },
        {
          userId: user.id,
          type: BookmarkTypes.LINK,
          createdAt: oneDayAgo,
          archived: false,
          favourited: false,
        },
        {
          userId: user.id,
          type: BookmarkTypes.LINK,
          createdAt: oneWeekAgo,
          archived: false,
          favourited: false,
        },
        {
          userId: user.id,
          type: BookmarkTypes.LINK,
          createdAt: oneMonthAgo,
          archived: false,
          favourited: false,
        },
      ])
      .returning();

    const stats = await caller.users.stats();

    // Verify activity counts based on time periods
    expect(stats.bookmarkingActivity.thisWeek).toBeGreaterThanOrEqual(2); // now + oneDayAgo
    expect(stats.bookmarkingActivity.thisMonth).toBeGreaterThanOrEqual(3); // now + oneDayAgo + oneWeekAgo
    expect(stats.bookmarkingActivity.thisYear).toBe(4); // All bookmarks

    // Verify that hour and day arrays have proper structure
    expect(
      stats.bookmarkingActivity.byHour.every(
        (h) => typeof h.hour === "number" && h.hour >= 0 && h.hour <= 23,
      ),
    ).toBe(true);

    expect(
      stats.bookmarkingActivity.byDayOfWeek.every(
        (d) => typeof d.day === "number" && d.day >= 0 && d.day <= 6,
      ),
    ).toBe(true);
  });

  describe("Password Reset", () => {
    test<CustomTestContext>("forgotPassword - successful email sending", async ({
      unauthedAPICaller,
    }) => {
      // Create a user first
      await unauthedAPICaller.users.create({
        name: "Test User",
        email: "reset@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      // With mocked email service, this should succeed
      const result = await unauthedAPICaller.users.forgotPassword({
        email: "reset@test.com",
      });

      expect(result.success).toBe(true);

      // Verify that the email function was called with correct parameters
      expect(emailModule.sendPasswordResetEmail).toHaveBeenCalledWith(
        "reset@test.com",
        "Test User",
        expect.any(String), // token
      );
    });

    test<CustomTestContext>("forgotPassword - non-existing user", async ({
      unauthedAPICaller,
    }) => {
      // Should not reveal if user exists or not
      const result = await unauthedAPICaller.users.forgotPassword({
        email: "nonexistent@test.com",
      });

      expect(result.success).toBe(true);
    });

    test<CustomTestContext>("forgotPassword - OAuth user (no password)", async ({
      db,
      unauthedAPICaller,
    }) => {
      // Create a user without password (OAuth user)
      await db.insert(users).values({
        name: "OAuth User",
        email: "oauth@test.com",
        password: null,
      });

      // Should not send reset email for OAuth users
      const result = await unauthedAPICaller.users.forgotPassword({
        email: "oauth@test.com",
      });

      expect(result.success).toBe(true);
    });

    test<CustomTestContext>("resetPassword - valid token", async ({
      db,
      unauthedAPICaller,
    }) => {
      // Create a user
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "validreset@test.com",
        password: "oldpass123",
        confirmPassword: "oldpass123",
      });

      // Create a password reset token directly in the database
      const token = "valid-reset-token";
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expires,
      });

      // Reset the password
      const result = await unauthedAPICaller.users.resetPassword({
        token,
        newPassword: "newpass123",
      });

      expect(result.success).toBe(true);

      // Verify the token was consumed (deleted)
      const remainingTokens = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, token));

      expect(remainingTokens).toHaveLength(0);

      // The password reset was successful if we got here without errors
    });

    test<CustomTestContext>("resetPassword - invalid token", async ({
      unauthedAPICaller,
    }) => {
      await expect(
        unauthedAPICaller.users.resetPassword({
          token: "invalid-token",
          newPassword: "newpass123",
        }),
      ).rejects.toThrow(/Invalid or expired reset token/);
    });

    test<CustomTestContext>("resetPassword - expired token", async ({
      db,
      unauthedAPICaller,
    }) => {
      // Create a user
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "expiredtoken@test.com",
        password: "oldpass123",
        confirmPassword: "oldpass123",
      });

      // Create an expired password reset token
      const token = "expired-reset-token";
      const expires = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago (expired)

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expires,
      });

      await expect(
        unauthedAPICaller.users.resetPassword({
          token,
          newPassword: "newpass123",
        }),
      ).rejects.toThrow(/Invalid or expired reset token/);

      // Verify the expired token was cleaned up
      const remainingTokens = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, token));

      expect(remainingTokens).toHaveLength(0);
    });

    test<CustomTestContext>("resetPassword - user not found", async ({
      db,
      unauthedAPICaller,
    }) => {
      // Create a user first, then delete them to create an orphaned token
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "orphaned@test.com",
        password: "oldpass123",
        confirmPassword: "oldpass123",
      });

      // Create a password reset token
      const token = "orphaned-token";
      const expires = new Date(Date.now() + 60 * 60 * 1000);

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expires,
      });

      // Delete the user to make the token orphaned
      // Due to foreign key cascade, this will also delete the token
      // So we expect "Invalid or expired reset token" instead of "User not found"
      await db.delete(users).where(eq(users.id, user.id));

      await expect(
        unauthedAPICaller.users.resetPassword({
          token,
          newPassword: "newpass123",
        }),
      ).rejects.toThrow(/Invalid or expired reset token/);
    });
    test<CustomTestContext>("resetPassword - password validation", async ({
      db,
      unauthedAPICaller,
    }) => {
      // Create a user
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "validation@test.com",
        password: "oldpass123",
        confirmPassword: "oldpass123",
      });

      // Create a password reset token
      const token = "validation-token";
      const expires = new Date(Date.now() + 60 * 60 * 1000);

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expires,
      });

      // Try to reset with a password that's too short
      await expect(
        unauthedAPICaller.users.resetPassword({
          token,
          newPassword: "123", // Too short
        }),
      ).rejects.toThrow();
    });

    test<CustomTestContext>("resetPassword - token reuse prevention", async ({
      db,
      unauthedAPICaller,
    }) => {
      // Create a user
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "reuse@test.com",
        password: "oldpass123",
        confirmPassword: "oldpass123",
      });

      // Create a password reset token
      const token = "reuse-token";
      const expires = new Date(Date.now() + 60 * 60 * 1000);

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expires,
      });

      // Use the token once
      await unauthedAPICaller.users.resetPassword({
        token,
        newPassword: "newpass123",
      });

      // Try to use the same token again
      await expect(
        unauthedAPICaller.users.resetPassword({
          token,
          newPassword: "anotherpass123",
        }),
      ).rejects.toThrow(/Invalid or expired reset token/);
    });
  });

  describe("Change Password", () => {
    test<CustomTestContext>("changePassword - successful change", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "changepass@test.com",
        password: "oldpass123",
        confirmPassword: "oldpass123",
      });
      const caller = getApiCaller(db, user.id, user.email, user.role || "user");

      await caller.users.changePassword({
        currentPassword: "oldpass123",
        newPassword: "newpass456",
      });

      // Password change should succeed without throwing
    });

    test<CustomTestContext>("changePassword - wrong current password", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "wrongpass@test.com",
        password: "oldpass123",
        confirmPassword: "oldpass123",
      });
      const caller = getApiCaller(db, user.id, user.email, user.role || "user");

      await expect(() =>
        caller.users.changePassword({
          currentPassword: "wrongpassword",
          newPassword: "newpass456",
        }),
      ).rejects.toThrow();
    });

    test<CustomTestContext>("changePassword - OAuth user (no password)", async ({
      db,
    }) => {
      // Create OAuth user without password
      await db.insert(users).values({
        name: "OAuth User",
        email: "oauth@test.com",
        password: null,
      });

      const oauthUser = await db
        .select()
        .from(users)
        .where(eq(users.email, "oauth@test.com"))
        .then((rows) => rows[0]);

      const caller = getApiCaller(db, oauthUser.id, oauthUser.email, "user");

      await expect(() =>
        caller.users.changePassword({
          currentPassword: "anypassword",
          newPassword: "newpass456",
        }),
      ).rejects.toThrow();
    });
  });

  describe("Delete Account", () => {
    test<CustomTestContext>("deleteAccount - with password", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "deleteaccount@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id, user.email, user.role || "user");

      await caller.users.deleteAccount({
        password: "pass1234",
      });

      // Verify user is deleted
      const deletedUser = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id));
      expect(deletedUser).toHaveLength(0);
    });

    test<CustomTestContext>("deleteAccount - wrong password", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "wrongdeletepass@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id, user.email, user.role || "user");

      await expect(() =>
        caller.users.deleteAccount({
          password: "wrongpassword",
        }),
      ).rejects.toThrow();
    });

    test<CustomTestContext>("deleteAccount - OAuth user (no password)", async ({
      db,
    }) => {
      // Create OAuth user without password
      await db.insert(users).values({
        name: "OAuth User",
        email: "oauthdelete@test.com",
        password: null,
      });

      const oauthUser = await db
        .select()
        .from(users)
        .where(eq(users.email, "oauthdelete@test.com"))
        .then((rows) => rows[0]);

      const caller = getApiCaller(db, oauthUser.id, oauthUser.email, "user");

      await caller.users.deleteAccount({});

      // Verify user is deleted
      const deletedUser = await db
        .select()
        .from(users)
        .where(eq(users.id, oauthUser.id));
      expect(deletedUser).toHaveLength(0);
    });
  });

  describe("Update Avatar", () => {
    test<CustomTestContext>("updateAvatar - promotes unknown asset", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Avatar Reject",
        email: "avatar-reject@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id, user.email, user.role || "user");

      await db.insert(assets).values({
        id: "avatar-asset-2",
        assetType: AssetTypes.UNKNOWN,
        userId: user.id,
        contentType: "image/png",
        size: 12,
        fileName: "avatar.png",
        bookmarkId: null,
      });

      await caller.users.updateAvatar({ assetId: "avatar-asset-2" });

      const updatedAsset = await db
        .select()
        .from(assets)
        .where(eq(assets.id, "avatar-asset-2"))
        .then((rows) => rows[0]);

      expect(updatedAsset?.assetType).toBe(AssetTypes.AVATAR);
    });

    test<CustomTestContext>("updateAvatar - deletes avatar asset", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Avatar Delete",
        email: "avatar-delete@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id, user.email, user.role || "user");

      await db.insert(assets).values({
        id: "avatar-asset-3",
        assetType: AssetTypes.UNKNOWN,
        userId: user.id,
        contentType: "image/png",
        size: 12,
        fileName: "avatar.png",
        bookmarkId: null,
      });

      await caller.users.updateAvatar({ assetId: "avatar-asset-3" });
      await caller.users.updateAvatar({ assetId: null });

      const updatedUser = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id))
        .then((rows) => rows[0]);
      const remainingAsset = await db
        .select()
        .from(assets)
        .where(eq(assets.id, "avatar-asset-3"))
        .then((rows) => rows[0]);

      expect(updatedUser?.image).toBeNull();
      expect(remainingAsset).toBeUndefined();
    });
  });

  describe("Who Am I", () => {
    test<CustomTestContext>("whoami - returns user info", async ({
      db,
      unauthedAPICaller,
    }) => {
      const user = await unauthedAPICaller.users.create({
        name: "Test User",
        email: "whoami@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });
      const caller = getApiCaller(db, user.id, user.email, user.role || "user");

      const whoami = await caller.users.whoami();

      expect(whoami.id).toBe(user.id);
      expect(whoami.name).toBe("Test User");
      expect(whoami.email).toBe("whoami@test.com");
      expect(whoami.localUser).toBe(true);
    });

    test<CustomTestContext>("whoami - OAuth user", async ({ db }) => {
      // Create OAuth user
      await db.insert(users).values({
        name: "OAuth User",
        email: "oauthwhoami@test.com",
        password: null,
      });

      const oauthUser = await db
        .select()
        .from(users)
        .where(eq(users.email, "oauthwhoami@test.com"))
        .then((rows) => rows[0]);

      const caller = getApiCaller(db, oauthUser.id, oauthUser.email, "user");

      const whoami = await caller.users.whoami();

      expect(whoami.id).toBe(oauthUser.id);
      expect(whoami.name).toBe("OAuth User");
      expect(whoami.email).toBe("oauthwhoami@test.com");
      expect(whoami.localUser).toBe(false);
    });
  });

  describe("Email Verification", () => {
    test<CustomTestContext>("verifyEmail - invalid token", async ({
      unauthedAPICaller,
    }) => {
      await expect(() =>
        unauthedAPICaller.users.verifyEmail({
          email: "nonexistent@test.com",
          token: "invalid-token",
        }),
      ).rejects.toThrow();
    });

    test<CustomTestContext>("verifyEmail - invalid email format", async ({
      unauthedAPICaller,
    }) => {
      await expect(() =>
        unauthedAPICaller.users.verifyEmail({
          email: "invalid-email",
          token: "some-token",
        }),
      ).rejects.toThrow();
    });
  });

  describe("Resend Verification Email", () => {
    test<CustomTestContext>("resendVerificationEmail - existing user", async ({
      unauthedAPICaller,
    }) => {
      // Create user first
      await unauthedAPICaller.users.create({
        name: "Test User",
        email: "resend@test.com",
        password: "pass1234",
        confirmPassword: "pass1234",
      });

      const result = await unauthedAPICaller.users.resendVerificationEmail({
        email: "resend@test.com",
      });

      expect(result.success).toBe(true);

      // Verify that the email function was called
      expect(emailModule.sendVerificationEmail).toHaveBeenCalledWith(
        "resend@test.com",
        "Test User",
        expect.any(String), // token
      );
    });

    test<CustomTestContext>("resendVerificationEmail - non-existing user", async ({
      unauthedAPICaller,
    }) => {
      // Should not reveal if user exists or not
      const result = await unauthedAPICaller.users.resendVerificationEmail({
        email: "nonexistent@test.com",
      });
      expect(result.success).toBe(true);
    });

    test<CustomTestContext>("resendVerificationEmail - invalid email format", async ({
      unauthedAPICaller,
    }) => {
      await expect(() =>
        unauthedAPICaller.users.resendVerificationEmail({
          email: "invalid-email",
        }),
      ).rejects.toThrow();
    });
  });
});
