import { vi } from "vitest";

import { getInMemoryDB } from "@karakeep/db/drizzle";
import { users } from "@karakeep/db/schema";

import type { Context } from "./index";
import { createCallerFactory } from "./index";
import { appRouter } from "./routers/_app";

const testQueueMocks = vi.hoisted(() => ({
  assetPreprocessingEnqueue: vi.fn(),
  embeddingsEnqueue: vi.fn(),
  linkCrawlerEnqueue: vi.fn(),
  lowPriorityCrawlerEnqueue: vi.fn(),
  openAIEnqueue: vi.fn(),
  ruleEngineEnqueue: vi.fn(),
  searchIndexingEnqueue: vi.fn(),
  triggerSearchReindex: vi.fn(),
}));

export function getTestQueueMocks() {
  return testQueueMocks;
}

export function getTestDB() {
  return getInMemoryDB(true);
}

export type TestDB = ReturnType<typeof getTestDB>;

export async function seedUsers(db: TestDB) {
  return await db
    .insert(users)
    .values([
      {
        name: "Test User 1",
        email: "test1@test.com",
      },
      {
        name: "Test User 2",
        email: "test2@test.com",
      },
      {
        name: "Test User 3",
        email: "test3@test.com",
      },
    ])
    .returning();
}

export function getApiCaller(
  db: TestDB,
  userId?: string,
  email?: string,
  role: "user" | "admin" = "user",
  auth: Context["auth"] = userId ? { type: "session" } : null,
) {
  const createCaller = createCallerFactory(appRouter);
  return createCaller({
    user: userId
      ? {
          id: userId,
          email,
          role,
        }
      : null,
    auth,
    db,
    req: {
      ip: null,
    },
  });
}

export async function getApiKeyCallerForPlainKey(db: TestDB, plainKey: string) {
  const { authenticateApiKey } = await import("./auth");
  const authResult = await authenticateApiKey(plainKey, db);
  return getApiCaller(
    db,
    authResult.user.id,
    authResult.user.email ?? undefined,
    authResult.user.role === "admin" ? "admin" : "user",
    {
      type: "apiKey",
      keyId: authResult.apiKey.keyId,
      scopes: authResult.apiKey.scopes,
    },
  );
}

export type APICallerType = ReturnType<typeof getApiCaller>;

export interface CustomTestContext {
  apiCallers: APICallerType[];
  unauthedAPICaller: APICallerType;
  db: TestDB;
}

export async function buildTestContext(
  seedDB: boolean,
): Promise<CustomTestContext> {
  const db = getTestDB();
  let users: Awaited<ReturnType<typeof seedUsers>> = [];
  if (seedDB) {
    users = await seedUsers(db);
  }
  const callers = users.map((u) => getApiCaller(db, u.id, u.email));

  return {
    apiCallers: callers,
    unauthedAPICaller: getApiCaller(db),
    db,
  };
}

export function defaultBeforeEach(seedDB = true) {
  return async (context: object) => {
    vi.mock("@karakeep/shared-server", async (original) => {
      const mod =
        (await original()) as typeof import("@karakeep/shared-server");
      return {
        ...mod,
        AssetPreprocessingQueue: {
          enqueue: testQueueMocks.assetPreprocessingEnqueue,
        },
        LinkCrawlerQueue: {
          enqueue: testQueueMocks.linkCrawlerEnqueue,
        },
        LowPriorityCrawlerQueue: {
          enqueue: testQueueMocks.lowPriorityCrawlerEnqueue,
        },
        OpenAIQueue: {
          enqueue: testQueueMocks.openAIEnqueue,
        },
        EmbeddingsQueue: {
          enqueue: testQueueMocks.embeddingsEnqueue,
        },
        SearchIndexingQueue: {
          enqueue: testQueueMocks.searchIndexingEnqueue,
        },
        RuleEngineQueue: {
          enqueue: testQueueMocks.ruleEngineEnqueue,
        },
        triggerSearchReindex: testQueueMocks.triggerSearchReindex,
      };
    });
    Object.assign(context, await buildTestContext(seedDB));
  };
}
