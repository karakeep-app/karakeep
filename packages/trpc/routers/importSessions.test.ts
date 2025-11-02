import { beforeEach, describe, expect, test } from "vitest";
import { z } from "zod";

import {
  BookmarkTypes,
  zNewBookmarkRequestSchema,
} from "@karakeep/shared/types/bookmarks";
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
  async function createTestBookmark(api: APICallerType, sessionId: string) {
    const newBookmarkInput: z.infer<typeof zNewBookmarkRequestSchema> = {
      type: BookmarkTypes.TEXT,
      text: "Test bookmark text",
      importSessionId: sessionId,
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
    await createTestBookmark(api, session.id);
    await createTestBookmark(api, session.id);

    const statsInput: z.infer<typeof zGetImportSessionStatsRequestSchema> = {
      importSessionId: session.id,
    };

    const stats = await api.importSessions.getImportSessionStats(statsInput);

    expect(stats).toMatchObject({
      id: session.id,
      name: "Test Import Session",
      status: "in_progress",
      totalBookmarks: 2,
      pendingBookmarks: 2,
      completedBookmarks: 0,
      failedBookmarks: 0,
      processingBookmarks: 0,
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

  test<CustomTestContext>("cannot attach other user's bookmark", async ({
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
      createTestBookmark(api2, session.id), // User 2's bookmark
    ).rejects.toThrow("Import session not found");
  });
});
