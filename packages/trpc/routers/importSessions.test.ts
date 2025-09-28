import { beforeEach, describe, expect, test } from "vitest";
import { z } from "zod";

import {
  BookmarkTypes,
  zNewBookmarkRequestSchema,
} from "@karakeep/shared/types/bookmarks";
import {
  zAttachBookmarkToSessionRequestSchema,
  zCreateImportSessionRequestSchema,
  zDeleteImportSessionRequestSchema,
  zGetImportSessionStatsRequestSchema,
  zListImportSessionsRequestSchema,
} from "@karakeep/shared/types/importSessions";
import { zNewBookmarkListSchema } from "@karakeep/shared/types/lists";

import type { APICallerType, CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("ImportSessions Routes", () => {
  async function createTestBookmark(api: APICallerType) {
    const newBookmarkInput: z.infer<typeof zNewBookmarkRequestSchema> = {
      type: BookmarkTypes.TEXT,
      text: "Test bookmark text",
    };
    const createdBookmark =
      await api.bookmarks.createBookmark(newBookmarkInput);
    return createdBookmark.id;
  }

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
    const sessions = await api.listImportSessions({ limit: 10 });
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
    const sessions = await api.listImportSessions({ limit: 10 });
    const sessionFromList = sessions.sessions.find(
      (s) => s.id === createdSession.id,
    );
    expect(sessionFromList?.rootListId).toBeNull();
  });

  test<CustomTestContext>("attach bookmark to session", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0];
    const bookmarkId = await createTestBookmark(api);

    const session = await api.importSessions.createImportSession({
      name: "Test Import Session",
    });

    const attachInput: z.infer<typeof zAttachBookmarkToSessionRequestSchema> = {
      importSessionId: session.id,
      bookmarkId,
    };

    const result =
      await api.importSessions.attachBookmarkToSession(attachInput);
    expect(result.success).toBe(true);

    // Verify stats show the attached bookmark
    const stats = await api.importSessions.getImportSessionStats({
      importSessionId: session.id,
    });
    expect(stats.totalBookmarks).toBe(1);
    expect(stats.pendingBookmarks).toBe(1);
  });

  test<CustomTestContext>("get import session stats", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0];
    const bookmarkId1 = await createTestBookmark(api);
    const bookmarkId2 = await createTestBookmark(api);

    const session = await api.importSessions.createImportSession({
      name: "Test Import Session",
    });

    // Attach multiple bookmarks
    await api.importSessions.attachBookmarkToSession({
      importSessionId: session.id,
      bookmarkId: bookmarkId1,
    });
    await api.importSessions.attachBookmarkToSession({
      importSessionId: session.id,
      bookmarkId: bookmarkId2,
    });

    const statsInput: z.infer<typeof zGetImportSessionStatsRequestSchema> = {
      importSessionId: session.id,
    };

    const stats = await api.importSessions.getImportSessionStats(statsInput);

    expect(stats).toMatchObject({
      id: session.id,
      name: "Test Import Session",
      status: "pending",
      totalBookmarks: 2,
      pendingBookmarks: 2,
      completedBookmarks: 0,
      failedBookmarks: 0,
      processingBookmarks: 0,
    });
  });

  test<CustomTestContext>("list import sessions with pagination", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].importSessions;

    // Create multiple sessions
    await Promise.all([
      api.createImportSession({ name: "Session 1" }),
      api.createImportSession({ name: "Session 2" }),
      api.createImportSession({ name: "Session 3" }),
    ]);

    const listInput: z.infer<typeof zListImportSessionsRequestSchema> = {
      limit: 2,
    };

    const result = await api.listImportSessions(listInput);

    expect(result.sessions).toHaveLength(2);
    expect(result.nextCursor).toBeDefined();

    // Test second page
    const secondPage = await api.listImportSessions({
      limit: 2,
      cursor: result.nextCursor!,
    });

    expect(secondPage.sessions).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
  });

  test<CustomTestContext>("start import session processing", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0];
    const bookmarkId = await createTestBookmark(api);

    const session = await api.importSessions.createImportSession({
      name: "Test Import Session",
    });

    // Attach a bookmark first
    await api.importSessions.attachBookmarkToSession({
      importSessionId: session.id,
      bookmarkId,
    });

    const result = await api.importSessions.startImportSessionProcessing({
      importSessionId: session.id,
    });

    expect(result.success).toBe(true);

    // Verify session status changed
    const stats = await api.importSessions.getImportSessionStats({
      importSessionId: session.id,
    });
    expect(stats.status).toBe("in_progress");
  });

  test<CustomTestContext>("start processing fails with no bookmarks", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].importSessions;

    const session = await api.createImportSession({
      name: "Empty Session",
    });

    await expect(
      api.startImportSessionProcessing({
        importSessionId: session.id,
      }),
    ).rejects.toThrow("Import session has no bookmarks to process");
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
    ).rejects.toThrow("User is not allowed to access this import session");

    await expect(
      api2.deleteImportSession({
        importSessionId: session.id,
      }),
    ).rejects.toThrow("User is not allowed to access this import session");
  });

  test<CustomTestContext>("cannot attach other user's bookmark", async ({
    apiCallers,
  }) => {
    const api1 = apiCallers[0];
    const api2 = apiCallers[1];

    // User 1 creates session and bookmark
    const session = await api1.importSessions.createImportSession({
      name: "User 1 Session",
    });
    const bookmarkId = await createTestBookmark(api2); // User 2's bookmark

    // User 1 tries to attach User 2's bookmark
    await expect(
      api1.importSessions.attachBookmarkToSession({
        importSessionId: session.id,
        bookmarkId,
      }),
    ).rejects.toThrow("Bookmark not found");
  });
});
