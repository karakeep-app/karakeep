import os from "node:os";
import path from "node:path";
import { isCuid } from "@paralleldrive/cuid2";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { getInMemoryDB } from "@karakeep/db/drizzle";
import { accounts, sessions, users } from "@karakeep/db/schema";

const BASE_URL = "http://localhost:3000";

interface SentEmail {
  type: "verify" | "reset";
  email: string;
  url: string;
}

async function setup(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("DATA_DIR", path.join(os.tmpdir(), "karakeep-auth-test"));
  vi.stubEnv("NEXTAUTH_URL", BASE_URL);
  vi.stubEnv("NEXTAUTH_SECRET", "test-secret-test-secret-test-secret");
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }

  const db = getInMemoryDB(true);
  const sent: SentEmail[] = [];
  vi.doMock("@karakeep/db", () => ({ db }));
  vi.doMock("@karakeep/trpc/email", () => ({
    sendVerificationEmail: async (
      email: string,
      _name: string,
      url: string,
    ) => {
      sent.push({ type: "verify", email, url });
    },
    sendPasswordResetEmail: async (
      email: string,
      _name: string,
      url: string,
    ) => {
      sent.push({ type: "reset", email, url });
    },
  }));

  const { auth } = await import("./auth");

  async function call(
    endpoint: string,
    opts: {
      body?: Record<string, unknown>;
      cookie?: string;
      method?: string;
      headers?: Record<string, string>;
    } = {},
  ) {
    const res = await auth.handler(
      new Request(`${BASE_URL}/api/auth${endpoint}`, {
        method: opts.method ?? (opts.body ? "POST" : "GET"),
        headers: {
          "content-type": "application/json",
          origin: BASE_URL,
          ...(opts.cookie ? { cookie: opts.cookie } : {}),
          ...opts.headers,
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      }),
    );
    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : null;
    const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
    return { status: res.status, json, cookie };
  }

  async function signUp(
    email: string,
    password = "password123",
    name = "Test User",
  ) {
    return await call("/sign-up/email", { body: { name, email, password } });
  }

  async function signIn(email: string, password = "password123") {
    return await call("/sign-in/email", { body: { email, password } });
  }

  return { auth, db, sent, call, signUp, signIn };
}

function errorCode(json: unknown) {
  if (json && typeof json === "object" && "code" in json) {
    return json.code;
  }
  return undefined;
}

function tokenFromUrl(url: string) {
  return new URL(url).searchParams.get("token") ?? "";
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@karakeep/db");
  vi.doUnmock("@karakeep/trpc/email");
});

describe("better-auth configuration", () => {
  test("sign up creates a user with a credential account", async () => {
    const { db, signUp } = await setup({ FREE_QUOTA_BOOKMARK_LIMIT: "42" });

    const first = await signUp("First@Example.com", "password123", "  First ");
    expect(first.status).toBe(200);
    // Signed in right away when email verification isn't required.
    expect(first.cookie).toMatch(/session_token=.+/);
    const second = await signUp("second@example.com");
    expect(second.status).toBe(200);

    const rows = await db.query.users.findMany();
    const firstUser = rows.find((u) => u.email === "first@example.com");
    const secondUser = rows.find((u) => u.email === "second@example.com");
    expect(firstUser?.role).toBe("admin");
    expect(firstUser?.name).toBe("First");
    expect(firstUser?.bookmarkQuota).toBe(42);
    expect(firstUser?.emailVerified).toBe(false);
    expect(secondUser?.role).toBe("user");

    const credential = await db.query.accounts.findFirst({
      where: eq(accounts.userId, firstUser?.id ?? ""),
    });
    expect(credential?.providerId).toBe("credential");
    expect(credential?.accountId).toBe(firstUser?.id);
    expect(credential?.password).toMatch(/^\$2[aby]\$/);

    // Ids are generated the same way as for the rest of Karakeep's tables.
    const session = await db.query.sessions.findFirst();
    for (const id of [firstUser?.id, credential?.id, session?.id]) {
      expect(isCuid(id ?? "")).toBe(true);
    }
  });

  test("sign up validates its input", async () => {
    const { db, signUp } = await setup();

    const htmlName = await signUp(
      "html@example.com",
      "password123",
      "<b>name</b>",
    );
    expect(htmlName.status).toBe(400);
    const shortPassword = await signUp("short@example.com", "short");
    expect(shortPassword.status).toBe(400);

    expect(await db.query.users.findMany()).toHaveLength(0);
  });

  test("sign in works with legacy salted passwords", async () => {
    const { db, signIn } = await setup();
    await db.insert(users).values({
      id: "legacy",
      name: "Legacy",
      email: "legacy@example.com",
      emailVerified: true,
    });
    await db.insert(accounts).values({
      userId: "legacy",
      accountId: "legacy",
      providerId: "credential",
      password: `bcrypt-salted:abc:${await bcrypt.hash("old-password" + "abc", 4)}`,
    });

    const ok = await signIn("LEGACY@example.com", "old-password");
    expect(ok.status).toBe(200);
    const wrong = await signIn("legacy@example.com", "wrong-password");
    expect(wrong.status).toBe(401);
    expect(errorCode(wrong.json)).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  test("sign in works from an address other than NEXTAUTH_URL", async () => {
    const { signUp, call } = await setup();
    await signUp("user@example.com");
    const body = { email: "user@example.com", password: "password123" };
    const requests: Record<string, string>[] = [
      { origin: "http://192.168.1.10:3000", host: "192.168.1.10:3000" },
      {
        origin: "https://karakeep.example.com",
        host: "localhost:3000",
        "x-forwarded-host": "karakeep.example.com",
      },
    ];
    for (const headers of requests) {
      expect((await call("/sign-in/email", { body, headers })).status).toBe(
        200,
      );
    }
  });

  test("cross-origin requests and redirects are rejected", async () => {
    const { signUp, call } = await setup();
    await signUp("user@example.com");
    const crossOrigin = await call("/sign-in/email", {
      body: { email: "user@example.com", password: "password123" },
      headers: { origin: "https://evil.example.com", host: "localhost:3000" },
    });
    expect(crossOrigin.status).toBe(403);
    const redirect = await call("/sign-in/email", {
      body: {
        email: "user@example.com",
        password: "password123",
        callbackURL: "https://evil.example.com/",
      },
    });
    expect(redirect.status).toBe(403);
  });

  test("endpoints Karakeep doesn't use are rejected", async () => {
    const { db, call, signUp } = await setup();
    const { cookie } = await signUp("user@example.com");

    const postEndpoints: { endpoint: string; body: Record<string, string> }[] =
      [
        {
          endpoint: "/update-user",
          body: { name: "<img src=x onerror=alert(1)>" },
        },
        { endpoint: "/delete-user", body: {} },
        { endpoint: "/revoke-sessions", body: {} },
        { endpoint: "/unlink-account", body: { providerId: "credential" } },
        { endpoint: "/verify-password", body: { password: "password123" } },
      ];
    for (const { endpoint, body } of postEndpoints) {
      const res = await call(endpoint, { cookie, body });
      expect(res.status, endpoint).toBe(404);
    }
    for (const endpoint of [
      "/list-accounts",
      "/list-sessions",
      "/reset-password/some-token",
    ]) {
      const res = await call(endpoint, { cookie });
      expect(res.status, endpoint).toBe(404);
    }

    const user = await db.query.users.findFirst();
    expect(user?.name).toBe("Test User");
    expect(await db.query.sessions.findMany()).toHaveLength(1);
  });

  test("change password", async () => {
    const { db, call, signUp, signIn } = await setup();
    const { cookie } = await signUp("user@example.com", "old-password");
    await signIn("user@example.com", "old-password");
    expect(await db.query.sessions.findMany()).toHaveLength(2);

    const wrong = await call("/change-password", {
      cookie,
      body: { currentPassword: "nope-nope", newPassword: "new-password" },
    });
    expect(errorCode(wrong.json)).toBe("INVALID_PASSWORD");

    const ok = await call("/change-password", {
      cookie,
      body: {
        currentPassword: "old-password",
        newPassword: "new-password",
        revokeOtherSessions: true,
      },
    });
    expect(ok.status).toBe(200);
    // The other session is revoked, the current one is replaced.
    expect(await db.query.sessions.findMany()).toHaveLength(1);
    expect((await signIn("user@example.com", "old-password")).status).toBe(401);
    expect((await signIn("user@example.com", "new-password")).status).toBe(200);
  });

  test("password reset isn't available without SMTP", async () => {
    const { call, signUp } = await setup();
    await signUp("user@example.com");
    const res = await call("/request-password-reset", {
      body: { email: "user@example.com" },
    });
    expect(res.status).toBe(400);
  });
});

describe("with email verification required", () => {
  const env = {
    EMAIL_VERIFICATION_REQUIRED: "true",
    SMTP_HOST: "smtp.example.com",
    SMTP_FROM: "karakeep@example.com",
  };

  test("users must verify their email before signing in", async () => {
    const { call, sent, signUp, signIn } = await setup(env);

    const res = await call("/sign-up/email", {
      body: {
        name: "User",
        email: "user@example.com",
        password: "password123",
        callbackURL: "karakeep://signin",
      },
    });
    expect(res.status).toBe(200);
    expect(res.cookie).toBe("");

    expect(sent).toHaveLength(1);
    const verificationUrl = new URL(sent[0].url);
    expect(verificationUrl.origin + verificationUrl.pathname).toBe(
      `${BASE_URL}/verify-email`,
    );
    expect(verificationUrl.searchParams.get("email")).toBe("user@example.com");
    expect(verificationUrl.searchParams.get("redirectUrl")).toBe(
      "karakeep://signin",
    );

    // The password is checked before the verification status, so unverified
    // accounts can't be discovered with a wrong password.
    const wrongPassword = await signIn("user@example.com", "wrong-password");
    expect(wrongPassword.status).toBe(401);
    const unverified = await signIn("user@example.com");
    expect(unverified.status).toBe(403);
    expect(errorCode(unverified.json)).toBe("EMAIL_NOT_VERIFIED");

    const verified = await call(
      `/verify-email?token=${tokenFromUrl(sent[0].url)}`,
    );
    expect(verified.status).toBe(200);
    expect((await signIn("user@example.com")).status).toBe(200);

    // Signing up again with the same email doesn't reveal that it's taken.
    const duplicate = await signUp("user@example.com");
    expect(duplicate.status).toBe(200);
  });

  test("password reset", async () => {
    const { db, call, sent, signUp, signIn } = await setup(env);
    await signUp("user@example.com", "old-password");
    await call(`/verify-email?token=${tokenFromUrl(sent[0].url)}`);
    await signIn("user@example.com", "old-password");
    expect(await db.query.sessions.findMany()).toHaveLength(1);

    const requested = await call("/request-password-reset", {
      body: { email: "USER@example.com" },
    });
    expect(requested.status).toBe(200);
    const resetEmail = sent.find((e) => e.type === "reset");
    expect(resetEmail?.url).toMatch(`${BASE_URL}/reset-password?token=`);
    const token = tokenFromUrl(resetEmail?.url ?? "");

    const reset = await call("/reset-password", {
      body: { token, newPassword: "new-password" },
    });
    expect(reset.status).toBe(200);
    // Existing sessions are revoked on reset.
    expect(await db.query.sessions.findMany()).toHaveLength(0);
    expect((await signIn("user@example.com", "old-password")).status).toBe(401);
    expect((await signIn("user@example.com", "new-password")).status).toBe(200);

    const reused = await call("/reset-password", {
      body: { token, newPassword: "another-password" },
    });
    expect(errorCode(reused.json)).toBe("INVALID_TOKEN");
  });

  test("password reset emails are only sent to users with a password", async () => {
    const { db, call, sent } = await setup(env);
    await db.insert(users).values({
      id: "oauth",
      name: "OAuth",
      email: "oauth@example.com",
      emailVerified: true,
    });

    for (const email of ["oauth@example.com", "nobody@example.com"]) {
      const res = await call("/request-password-reset", { body: { email } });
      expect(res.status).toBe(200);
    }
    expect(sent).toHaveLength(0);
  });
});

describe("server config restrictions", () => {
  test("signups can be disabled", async () => {
    const { db, signUp, signIn } = await setup({ DISABLE_SIGNUPS: "true" });
    const res = await signUp("user@example.com");
    expect(res.status).toBe(403);
    expect(await db.query.users.findMany()).toHaveLength(0);

    await db.insert(users).values({
      id: "existing",
      name: "Existing",
      email: "existing@example.com",
      emailVerified: true,
    });
    await db.insert(accounts).values({
      userId: "existing",
      accountId: "existing",
      providerId: "credential",
      password: await bcrypt.hash("password123", 4),
    });
    expect((await signIn("existing@example.com")).status).toBe(200);
  });

  test("password auth can be disabled", async () => {
    const { call, signUp, signIn } = await setup({
      DISABLE_PASSWORD_AUTH: "true",
    });
    expect((await signUp("user@example.com")).status).toBe(403);
    expect((await signIn("user@example.com")).status).toBe(403);
    const reset = await call("/request-password-reset", {
      body: { email: "user@example.com" },
    });
    expect(reset.status).toBe(403);
  });

  test("demo mode allows signing in but not other writes", async () => {
    const { db, call, signUp, signIn } = await setup({ DEMO_MODE: "true" });
    expect((await signUp("new@example.com")).status).toBe(403);

    await db.insert(users).values({
      id: "demo",
      name: "Demo",
      email: "demo@example.com",
      emailVerified: true,
    });
    await db.insert(accounts).values({
      userId: "demo",
      accountId: "demo",
      providerId: "credential",
      password: await bcrypt.hash("password123", 4),
    });
    const signedIn = await signIn("demo@example.com");
    expect(signedIn.status).toBe(200);

    const changed = await call("/change-password", {
      cookie: signedIn.cookie,
      body: { currentPassword: "password123", newPassword: "new-password" },
    });
    expect(changed.status).toBe(403);
  });

  test("degraded mode rejects writes with a clear error", async () => {
    const { signIn } = await setup({ DEGRADED_MODE: "true" });
    const res = await signIn("user@example.com");
    expect(res.status).toBe(403);
  });

  test("turnstile is required when enabled", async () => {
    const { db, signUp } = await setup({
      TURNSTILE_SITE_KEY: "site-key",
      TURNSTILE_SECRET_KEY: "secret-key",
    });
    expect((await signUp("user@example.com")).status).toBe(400);
    expect(await db.query.users.findMany()).toHaveLength(0);
  });

  test("deleting a user removes their sessions and accounts", async () => {
    const { db, signUp } = await setup();
    await signUp("user@example.com");
    const user = await db.query.users.findFirst();
    await db.delete(users).where(eq(users.id, user?.id ?? ""));
    expect(await db.query.sessions.findMany()).toHaveLength(0);
    expect(
      await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, user?.id ?? "")),
    ).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);
  });
});

describe("trusted origins", () => {
  const body = { email: "user@example.com", password: "password123" };
  const lanIp = {
    origin: "http://192.168.1.10:3000",
    host: "192.168.1.10:3000",
  };

  test("can be restricted to NEXTAUTH_URL", async () => {
    const { signUp, call } = await setup({ AUTH_TRUSTED_ORIGINS: "" });
    await signUp("user@example.com");
    expect(
      (await call("/sign-in/email", { body, headers: lanIp })).status,
    ).toBe(403);
    expect((await call("/sign-in/email", { body })).status).toBe(200);
  });

  test("can list extra origins", async () => {
    const { signUp, call } = await setup({
      AUTH_TRUSTED_ORIGINS:
        "https://karakeep.example.com, https://other.example.com",
    });
    await signUp("user@example.com");
    expect(
      (await call("/sign-in/email", { body, headers: lanIp })).status,
    ).toBe(403);
    const other = await call("/sign-in/email", {
      body: { ...body, callbackURL: "https://karakeep.example.com/dashboard" },
      headers: { origin: "https://other.example.com" },
    });
    expect(other.status).toBe(200);
  });
});

describe("oauth token endpoint authentication", () => {
  const ISSUER = "https://idp.example.com";

  async function signInWithOAuth(env: Record<string, string>) {
    const tokenRequests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (url.pathname === "/.well-known/openid-configuration") {
          return Response.json({
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/authorize`,
            token_endpoint: `${ISSUER}/token`,
            userinfo_endpoint: `${ISSUER}/userinfo`,
          });
        }
        if (url.pathname === "/token") {
          tokenRequests.push(request);
          return Response.json({ access_token: "at", token_type: "Bearer" });
        }
        if (url.pathname === "/userinfo") {
          return Response.json({
            sub: "oauth-sub",
            email: "oauth@example.com",
            email_verified: true,
            name: "OAuth User",
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const { auth, db } = await setup({
      OAUTH_WELLKNOWN_URL: `${ISSUER}/.well-known/openid-configuration`,
      OAUTH_CLIENT_ID: "karakeep",
      OAUTH_CLIENT_SECRET: "a+b/c=%41 d",
      ...env,
    });

    const start = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/oauth2`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE_URL },
        body: JSON.stringify({ providerId: "custom", callbackURL: "/" }),
      }),
    );
    const { url } = z.object({ url: z.string() }).parse(await start.json());
    const state = new URL(url).searchParams.get("state") ?? "";
    const cookie = start.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const callback = await auth.handler(
      new Request(
        `${BASE_URL}/api/auth/oauth2/callback/custom?code=the-code&state=${state}`,
        { headers: { cookie } },
      ),
    );
    return { callback, tokenRequests, db };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("defaults to basic auth with form-urlencoded credentials", async () => {
    const { callback, tokenRequests, db } = await signInWithOAuth({});
    expect(callback.headers.get("location")).toBe("/");
    expect(tokenRequests).toHaveLength(1);
    const [request] = tokenRequests;
    expect(request.headers.get("authorization")).toBe(
      `Basic ${Buffer.from("karakeep:a%2Bb%2Fc%3D%2541+d").toString("base64")}`,
    );
    const form = new URLSearchParams(await request.text());
    expect(form.has("client_secret")).toBe(false);
    expect(form.get("redirect_uri")).toBe(
      `${BASE_URL}/api/auth/callback/custom`,
    );
    expect(
      await db.query.accounts.findFirst({
        where: eq(accounts.accountId, "oauth-sub"),
      }),
    ).toBeDefined();
  });

  test("supports client_secret_post", async () => {
    const { callback, tokenRequests } = await signInWithOAuth({
      OAUTH_TOKEN_ENDPOINT_AUTH_METHOD: "client_secret_post",
    });
    expect(callback.headers.get("location")).toBe("/");
    const [request] = tokenRequests;
    expect(request.headers.get("authorization")).toBeNull();
    const form = new URLSearchParams(await request.text());
    expect(form.get("client_id")).toBe("karakeep");
    expect(form.get("client_secret")).toBe("a+b/c=%41 d");
  });
});
