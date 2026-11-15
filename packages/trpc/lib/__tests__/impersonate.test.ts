import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { users } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../../testUtils";
import { defaultBeforeEach } from "../../testUtils";
import { buildImpersonatingAuthedContext } from "../impersonate";

const { getRateLimitClientMock, checkRateLimitMock } = vi.hoisted(() => ({
  getRateLimitClientMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}));

vi.mock("@karakeep/shared/ratelimiting", async (original) => ({
  ...(await original<typeof import("@karakeep/shared/ratelimiting")>()),
  getRateLimitClient: getRateLimitClientMock,
}));

let wasRateLimitingEnabled: boolean;

async function getFirstUserId(db: CustomTestContext["db"]) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, "test1@test.com"),
  });
  return user!.id;
}

beforeEach<CustomTestContext>(async (context) => {
  await defaultBeforeEach(true)(context);
  wasRateLimitingEnabled = serverConfig.rateLimiting.enabled;
  serverConfig.rateLimiting.enabled = true;
  // Every rate limit check fails, so any request that reaches the limiter is
  // rejected.
  checkRateLimitMock.mockReset();
  checkRateLimitMock.mockResolvedValue({ allowed: false, resetInSeconds: 60 });
  getRateLimitClientMock.mockResolvedValue({
    checkRateLimit: checkRateLimitMock,
  });
});

afterEach(() => {
  serverConfig.rateLimiting.enabled = wasRateLimitingEnabled;
});

describe("buildImpersonatingAuthedContext", () => {
  test<CustomTestContext>("marks the context as internal", async ({ db }) => {
    const userId = await getFirstUserId(db);
    const ctx = await buildImpersonatingAuthedContext(userId, db);
    expect(ctx.auth).toEqual({ type: "internal" });
  });

  test<CustomTestContext>("impersonated calls bypass user-facing rate limits", async ({
    db,
  }) => {
    const userId = await getFirstUserId(db);
    // Imported lazily so that testUtils' queue mocks are in place first.
    const { createCallerFactory } = await import("../..");
    const { appRouter } = await import("../../routers/_app");
    const caller = createCallerFactory(appRouter)(
      await buildImpersonatingAuthedContext(userId, db),
    );

    const bookmark = await caller.bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://example.com",
    });
    expect(bookmark.id).toBeDefined();
  });

  test<CustomTestContext>("session calls for the same user are still rate limited", async ({
    apiCallers,
  }) => {
    await expect(
      apiCallers[0].bookmarks.createBookmark({
        type: BookmarkTypes.LINK,
        url: "https://example.com",
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
