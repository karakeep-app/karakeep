import { beforeEach, describe, expect, test } from "vitest";
import { z } from "zod";

import {
  bookmarkLinks,
  bookmarks,
  bookmarkTexts,
  importStagingBookmarks,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import {
  zCreateImportSessionRequestSchema,
  zDeleteImportSessionRequestSchema,
  zGetImportSessionStatsRequestSchema,
} from "@karakeep/shared/types/importSessions";
import { zNewBookmarkListSchema } from "@karakeep/shared/types/lists";

import type { APICallerType, CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("ImportSessions Routes", () => {
  async function createTestList(api: APICallerType) {
    const newListInput: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Test Import List",
      description: "A test list for imports",
      icon: "📋",
      type: "manual",
    };
    const createdList = await api.lists.create(newListInput);
    return createdList.id;
  }

  test<CustomTestContext>("create import session", async ({ apiCallers }) => {
    const api = apiCallers[0].importSessions;
    const listId = await createTestList(apiCallers[0]);

    const newSessionInput: z.infer<typeof zCreateImportSessionRequestSchema> = {
      name: "Test Import Session",
      rootListId: listId,
    };

    const createdSession = await api.createImportSession(newSessionInput);

    expect(createdSession).toMatchObject({
      id: expect.any(String),
    });

    // Verify session appears in list
    const sessions = await api.listImportSessions({});
    const sessionFromList = sessions.sessions.find(
      (s) => s.id === createdSession.id,
    );
    expect(sessionFromList).toBeDefined();
    expect(sessionFromList?.name).toEqual(newSessionInput.name);
    expect(sessionFromList?.rootListId).toEqual(listId);
  });

  test<CustomTestContext>("create import session without rootListId", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].importSessions;

    const newSessionInput: z.infer<typeof zCreateImportSessionRequestSchema> = {
      name: "Test Import Session",
    };

    const createdSession = await api.createImportSession(newSessionInput);

    expect(createdSession).toMatchObject({
      id: expect.any(String),
    });

    // Verify session appears in list
    const sessions = await api.listImportSessions({});
    const sessionFromList = sessions.sessions.find(
      (s) => s.id === createdSession.id,
    );
    expect(sessionFromList?.rootListId).toBeNull();
  });

  test<CustomTestContext>("get import session stats", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0];

    const session = await api.importSessions.createImportSession({
      name: "Test Import Session",
    });

    // Stage bookmarks using the staging flow
    await api.importSessions.stageImportedBookmarks({
      importSessionId: session.id,
      bookmarks: [
        { type: "text", content: "Test bookmark 1", tags: [], listIds: [] },
        { type: "text", content: "Test bookmark 2", tags: [], listIds: [] },
      ],
    });

    const statsInput: z.infer<typeof zGetImportSessionStatsRequestSchema> = {
      importSessionId: session.id,
    };

    const stats = await api.importSessions.getImportSessionStats(statsInput);

    expect(stats).toMatchObject({
      id: session.id,
      name: "Test Import Session",
      status: "staging",
      totalBookmarks: 2,
      pendingBookmarks: 2,
      completedBookmarks: 0,
      failedBookmarks: 0,
      processingBookmarks: 0,
    });
  });

  test<CustomTestContext>("stats reflect crawl and tagging status for completed staging bookmarks", async ({
    apiCallers,
    db,
  }) => {
    const api = apiCallers[0];

    const session = await api.importSessions.createImportSession({
      name: "Test Import Session",
    });

    // Create bookmarks with different crawl/tag statuses
    const user = (await db.query.users.findFirst())!;

    // 1. Link bookmark: crawl success, tag success -> completed
    const [completedLinkBookmark] = await db
      .insert(bookmarks)
      .values({
        userId: user.id,
        type: BookmarkTypes.LINK,
        taggingStatus: "success",
      })
      .returning();
    await db.insert(bookmarkLinks).values({
      id: completedLinkBookmark.id,
      url: "https://example.com/1",
      crawlStatus: "success",
    });

    // 2. Link bookmark: crawl pending, tag success -> processing
    const [crawlPendingBookmark] = await db
      .insert(bookmarks)
      .values({
        userId: user.id,
        type: BookmarkTypes.LINK,
        taggingStatus: "success",
      })
      .returning();
    await db.insert(bookmarkLinks).values({
      id: crawlPendingBookmark.id,
      url: "https://example.com/2",
      crawlStatus: "pending",
    });

    // 3. Text bookmark: tag pending -> processing
    const [tagPendingBookmark] = await db
      .insert(bookmarks)
      .values({
        userId: user.id,
        type: BookmarkTypes.TEXT,
        taggingStatus: "pending",
      })
      .returning();
    await db.insert(bookmarkTexts).values({
      id: tagPendingBookmark.id,
      text: "Test text",
    });

    // 4. Link bookmark: crawl failure -> failed
    const [crawlFailedBookmark] = await db
      .insert(bookmarks)
      .values({
        userId: user.id,
        type: BookmarkTypes.LINK,
        taggingStatus: "success",
      })
      .returning();
    await db.insert(bookmarkLinks).values({
      id: crawlFailedBookmark.id,
      url: "https://example.com/3",
      crawlStatus: "failure",
    });

    // 5. Text bookmark: tag failure -> failed
    const [tagFailedBookmark] = await db
      .insert(bookmarks)
      .values({
        userId: user.id,
        type: BookmarkTypes.TEXT,
        taggingStatus: "failure",
      })
      .returning();
    await db.insert(bookmarkTexts).values({
      id: tagFailedBookmark.id,
      text: "Test text 2",
    });

    // 6. Text bookmark: tag success (no crawl needed) -> completed
    const [completedTextBookmark] = await db
      .insert(bookmarks)
      .values({
        userId: user.id,
        type: BookmarkTypes.TEXT,
        taggingStatus: "success",
      })
      .returning();
    await db.insert(bookmarkTexts).values({
      id: completedTextBookmark.id,
      text: "Test text 3",
    });

    // Create staging bookmarks in different states
    await db.insert(importStagingBookmarks).values([
      // Staging pending -> pendingBookmarks
      {
        importSessionId: session.id,
        type: "text",
        content: "pending staging",
        status: "pending",
      },
      // Staging processing -> processingBookmarks
      {
        importSessionId: session.id,
        type: "text",
        content: "processing staging",
        status: "processing",
      },
      // Staging failed -> failedBookmarks
      {
        importSessionId: session.id,
        type: "text",
        content: "failed staging",
        status: "failed",
      },
      // Staging completed + crawl/tag success -> completedBookmarks
      {
        importSessionId: session.id,
        type: "link",
        url: "https://example.com/1",
        status: "completed",
        resultBookmarkId: completedLinkBookmark.id,
      },
      // Staging completed + crawl pending -> processingBookmarks
      {
        importSessionId: session.id,
        type: "link",
        url: "https://example.com/2",
        status: "completed",
        resultBookmarkId: crawlPendingBookmark.id,
      },
      // Staging completed + tag pending -> processingBookmarks
      {
        importSessionId: session.id,
        type: "text",
        content: "tag pending",
        status: "completed",
        resultBookmarkId: tagPendingBookmark.id,
      },
      // Staging completed + crawl failure -> failedBookmarks
      {
        importSessionId: session.id,
        type: "link",
        url: "https://example.com/3",
        status: "completed",
        resultBookmarkId: crawlFailedBookmark.id,
      },
      // Staging completed + tag failure -> failedBookmarks
      {
        importSessionId: session.id,
        type: "text",
        content: "tag failed",
        status: "completed",
        resultBookmarkId: tagFailedBookmark.id,
      },
      // Staging completed + tag success (text, no crawl) -> completedBookmarks
      {
        importSessionId: session.id,
        type: "text",
        content: "completed text",
        status: "completed",
        resultBookmarkId: completedTextBookmark.id,
      },
    ]);

    const stats = await api.importSessions.getImportSessionStats({
      importSessionId: session.id,
    });

    expect(stats).toMatchObject({
      totalBookmarks: 9,
      pendingBookmarks: 1, // staging pending
      processingBookmarks: 3, // staging processing + crawl pending + tag pending
      completedBookmarks: 2, // link success + text success
      failedBookmarks: 3, // staging failed + crawl failure + tag failure
    });
  });

  test<CustomTestContext>("list import sessions returns all sessions", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].importSessions;

    const sessionNames = ["Session 1", "Session 2", "Session 3"];
    for (const name of sessionNames) {
      await api.createImportSession({ name });
    }

    const result = await api.listImportSessions({});

    expect(result.sessions).toHaveLength(3);
    expect(result.sessions.map((session) => session.name)).toEqual(
      sessionNames,
    );
    expect(
      result.sessions.every((session) => session.totalBookmarks === 0),
    ).toBe(true);
  });

  test<CustomTestContext>("delete import session", async ({ apiCallers }) => {
    const api = apiCallers[0].importSessions;

    const session = await api.createImportSession({
      name: "Session to Delete",
    });

    const deleteInput: z.infer<typeof zDeleteImportSessionRequestSchema> = {
      importSessionId: session.id,
    };

    const result = await api.deleteImportSession(deleteInput);
    expect(result.success).toBe(true);

    // Verify session no longer exists
    await expect(
      api.getImportSessionStats({
        importSessionId: session.id,
      }),
    ).rejects.toThrow("Import session not found");
  });

  test<CustomTestContext>("cannot access other user's session", async ({
    apiCallers,
  }) => {
    const api1 = apiCallers[0].importSessions;
    const api2 = apiCallers[1].importSessions;

    // User 1 creates a session
    const session = await api1.createImportSession({
      name: "User 1 Session",
    });

    // User 2 tries to access it
    await expect(
      api2.getImportSessionStats({
        importSessionId: session.id,
      }),
    ).rejects.toThrow("Import session not found");

    await expect(
      api2.deleteImportSession({
        importSessionId: session.id,
      }),
    ).rejects.toThrow("Import session not found");
  });

  test<CustomTestContext>("cannot stage other user's session", async ({
    apiCallers,
  }) => {
    const api1 = apiCallers[0];
    const api2 = apiCallers[1];

    // User 1 creates session and bookmark
    const session = await api1.importSessions.createImportSession({
      name: "User 1 Session",
    });

    // User 1 tries to attach User 2's bookmark
    await expect(
      api2.importSessions.stageImportedBookmarks({
        importSessionId: session.id,
        bookmarks: [
          {
            type: "text",
            content: "Test bookmark",
            tags: [],
            listIds: [],
          },
        ],
      }),
    ).rejects.toThrow("Import session not found");
  });
});
