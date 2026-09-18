import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  githubStarsAuthorizations,
  githubStarsConnections,
  users,
} from "@karakeep/db/schema";
import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";
import {
  beginGithubConnection,
  completeGithubConnection,
  getGithubAccessToken,
  openGithubSecret,
  sealGithubSecret,
} from "./githubStarsConnection";

vi.mock("@karakeep/shared/config", async (original) => {
  const module = await original<typeof import("@karakeep/shared/config")>();
  return {
    default: {
      ...module.default,
      githubStars: { clientId: "test-client", clientSecret: "test-secret" },
      signingSecret: () => "isolated-test-key",
    },
  };
});
beforeEach<CustomTestContext>(defaultBeforeEach(true));
afterEach(() => vi.unstubAllGlobals());
const owner = (ctx: CustomTestContext) => ctx.db.select().from(users).get()!.id;
const response = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
function github() {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      response({
        access_token: "test-access",
        expires_in: 1,
        refresh_token: "test-refresh",
        refresh_token_expires_in: 3600,
      }),
    )
    .mockResolvedValueOnce(response({ login: "octocat" }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
async function connected(ctx: CustomTestContext) {
  const userId = owner(ctx);
  const url = new URL(beginGithubConnection(ctx.db, userId));
  await completeGithubConnection(
    ctx.db,
    userId,
    url.searchParams.get("state")!,
    "code",
  );
  return ctx.db.select().from(githubStarsConnections).get()!;
}

test("credentials are authenticated, encrypted and bound to their owner", () => {
  const ciphertext = sealGithubSecret("test-access", "owner");
  expect(ciphertext).not.toContain("test-access");
  expect(openGithubSecret(ciphertext, "owner")).toBe("test-access");
  expect(() => openGithubSecret(ciphertext, "someone-else")).toThrow();
  const corrupt = Buffer.from(ciphertext, "base64url");
  corrupt[corrupt.length - 1] ^= 1;
  expect(() =>
    openGithubSecret(corrupt.toString("base64url"), "owner"),
  ).toThrow();
});

test<CustomTestContext>("authorization binds state to a user, uses PKCE and cannot be replayed", async (ctx) => {
  const fetchMock = github();
  const userId = owner(ctx);
  const url = new URL(beginGithubConnection(ctx.db, userId));
  const state = url.searchParams.get("state")!;
  await expect(
    completeGithubConnection(ctx.db, "another-user", state, "code"),
  ).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
  await completeGithubConnection(ctx.db, userId, state, "code");
  const body = fetchMock.mock.calls[0][1]!.body as URLSearchParams;
  expect(
    createHash("sha256").update(body.get("code_verifier")!).digest("base64url"),
  ).toBe(url.searchParams.get("code_challenge"));
  expect(fetchMock.mock.calls[0][1]?.redirect).toBe("error");
  await expect(
    completeGithubConnection(ctx.db, userId, state, "code"),
  ).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const status = await ctx.apiCallers[0].githubStars.connection();
  expect(status.account).toEqual({ login: "octocat" });
  expect(JSON.stringify(status)).not.toContain("test-access");
  expect(
    ctx.db.select().from(githubStarsConnections).get()!.credentials,
  ).not.toContain("test-access");
});

test<CustomTestContext>("expired authorization never exchanges a code", async (ctx) => {
  const fetchMock = github();
  const userId = owner(ctx);
  const url = new URL(beginGithubConnection(ctx.db, userId));
  ctx.db
    .update(githubStarsAuthorizations)
    .set({ expiresAt: new Date(0) })
    .run();
  await expect(
    completeGithubConnection(
      ctx.db,
      userId,
      url.searchParams.get("state")!,
      "code",
    ),
  ).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});

test<CustomTestContext>("refresh rotates credentials and disconnect cannot resurrect them", async (ctx) => {
  const fetchMock = github();
  const account = await connected(ctx);
  fetchMock.mockResolvedValueOnce(
    response({
      access_token: "rotated",
      expires_in: 1,
      refresh_token: "rotated-refresh",
      refresh_token_expires_in: 3600,
    }),
  );
  expect(await getGithubAccessToken(ctx.db, account.id)).toBe("rotated");
  expect(
    (fetchMock.mock.calls[2][1]!.body as URLSearchParams).get("grant_type"),
  ).toBe("refresh_token");
  fetchMock.mockImplementationOnce(async () => {
    await ctx.apiCallers[0].githubStars.disconnectAccount();
    return response({ access_token: "late-token", expires_in: 3600 });
  });
  await expect(getGithubAccessToken(ctx.db, account.id)).rejects.toThrow();
  expect(ctx.db.select().from(githubStarsConnections).get()).toBeUndefined();
});

test<CustomTestContext>("disconnect during authorization prevents a late callback from reconnecting", async (ctx) => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(async () => {
      await ctx.apiCallers[0].githubStars.disconnectAccount();
      return response({ access_token: "late-token" });
    })
    .mockResolvedValueOnce(response({ login: "octocat" }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(connected(ctx)).rejects.toThrow("cancelled");
  expect(ctx.db.select().from(githubStarsConnections).get()).toBeUndefined();
});

test<CustomTestContext>("connected imports use the owner's identity and disconnect cancels their subscription", async (ctx) => {
  github();
  await connected(ctx);
  const api = ctx.apiCallers[0];
  const list = await api.lists.create({
    name: "Stars",
    type: "manual",
    icon: "⭐",
  });
  const subscription = await api.githubStars.save({
    username: "another-user",
    source: "connected",
    listId: list.id,
    enabled: true,
    importTopics: false,
  });
  expect(subscription.username).toBe("octocat");
  expect(subscription.connectionId).not.toBeNull();
  expect((await ctx.apiCallers[1].githubStars.connection()).account).toBeNull();
  await api.githubStars.disconnectAccount();
  expect(await api.githubStars.get()).toBeNull();
  expect(
    ctx.db
      .select()
      .from(githubStarsAuthorizations)
      .where(eq(githubStarsAuthorizations.userId, owner(ctx)))
      .get(),
  ).toBeUndefined();
});
