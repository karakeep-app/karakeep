import { cache } from "react";
import { TURNSTILE_TOKEN_HEADER } from "@/lib/auth/constants";
import { createId } from "@paralleldrive/cuid2";
import { count } from "drizzle-orm";
import { headers } from "next/headers";
import requestIp from "request-ip";
import { z } from "zod";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins";
import type { GenericOAuthConfig } from "better-auth/plugins";

import { db } from "@karakeep/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import type { RateLimitConfig } from "@karakeep/shared/ratelimiting";
import { getRateLimitClient } from "@karakeep/shared/ratelimiting";
import { getReadOnlyModeError } from "@karakeep/shared/readOnlyMode";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  zUserNameSchema,
} from "@karakeep/shared/types/users";
import { validateRedirectUrl } from "@karakeep/shared/utils/redirectUrl";
import {
  containsUnsafeUserNameMarkup,
  normalizeUserNameInput,
} from "@karakeep/shared/utils/userName";
import { logEvent } from "@karakeep/shared-server";
import {
  hashPassword,
  hasPassword,
  verifyPasswordHash,
} from "@karakeep/trpc/auth";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@karakeep/trpc/email";
import { verifyTurnstileToken } from "@karakeep/trpc/lib/turnstile";

const CUSTOM_OAUTH_PROVIDER_ID = "custom";
const DEFAULT_DISPLAY_NAME = "User";

// The better-auth endpoints Karakeep uses. Everything else (update-user,
// delete-user, account linking, session listing, ...) is rejected, because
// those endpoints bypass Karakeep's own validation and read-only checks.
const ALLOWED_PATHS = new Set([
  "/ok",
  "/error",
  "/get-session",
  "/sign-in/email",
  "/sign-up/email",
  "/sign-out",
  "/send-verification-email",
  "/verify-email",
  "/request-password-reset",
  "/reset-password",
  "/change-password",
  "/sign-in/oauth2",
  "/oauth2/callback/:providerId",
]);

const PASSWORD_PATHS = new Set([
  "/sign-in/email",
  "/sign-up/email",
  "/request-password-reset",
  "/reset-password",
  "/change-password",
]);

// Paths that only read from the database. They're the only ones that work in
// degraded mode, where the database is opened read-only.
const READ_ONLY_PATHS = new Set(["/ok", "/error", "/get-session"]);

// Paths that create or destroy sessions. They stay available in demo mode,
// which blocks all other writes.
const SESSION_PATHS = new Set([
  "/sign-in/email",
  "/sign-out",
  "/sign-in/oauth2",
  "/oauth2/callback/:providerId",
]);

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  "/sign-in/email": {
    name: "auth.login",
    windowMs: 15 * 60 * 1000,
    maxRequests: 10,
  },
  "/sign-up/email": {
    name: "auth.signup",
    windowMs: 60 * 1000,
    maxRequests: 3,
  },
  "/send-verification-email": {
    name: "auth.sendVerificationEmail",
    windowMs: 5 * 60 * 1000,
    maxRequests: 3,
  },
  "/verify-email": {
    name: "auth.verifyEmail",
    windowMs: 5 * 60 * 1000,
    maxRequests: 10,
  },
  "/request-password-reset": {
    name: "auth.requestPasswordReset",
    windowMs: 15 * 60 * 1000,
    maxRequests: 3,
  },
  "/reset-password": {
    name: "auth.resetPassword",
    windowMs: 5 * 60 * 1000,
    maxRequests: 10,
  },
  "/change-password": {
    name: "auth.changePassword",
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
  },
};

const zSignUpBody = z.object({
  name: zUserNameSchema,
  email: z.string().email(),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});

const zEmailBody = z.object({ email: z.string() });

export interface AuthSession {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    role: "admin" | "user";
  };
  expires: string;
}

function normalizeSafeDisplayName(name: string | null | undefined): string {
  const normalizedName = normalizeUserNameInput(name ?? "");
  return !containsUnsafeUserNameMarkup(name ?? "") && normalizedName
    ? normalizedName
    : DEFAULT_DISPLAY_NAME;
}

async function isFirstUser(): Promise<boolean> {
  const [{ count: userCount }] = await db
    .select({ count: count() })
    .from(users);
  return userCount === 0;
}

function assertWritesAllowed() {
  const message = getReadOnlyModeError(serverConfig);
  if (message) {
    throw new APIError("FORBIDDEN", { message });
  }
}

// The origin of the host the request was sent to. next-auth accepted sign-ins
// from any address Karakeep was reached at, even when it didn't match
// NEXTAUTH_URL (e.g. a LAN IP), and trusting the request's own host keeps that
// working. A cross-site request can't make the browser send a Host (or a custom
// X-Forwarded-Host header) other than the server's, so this only ever matches
// same-origin requests and doesn't allow redirects to other sites.
function getRequestOrigins(request: Request | undefined): string[] {
  if (!request) {
    return [];
  }
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    new URL(request.url).host;
  if (!host) {
    return [];
  }
  return [`http://${host}`, `https://${host}`];
}

// "*" in AUTH_TRUSTED_ORIGINS stands for the request's own origin rather than
// any origin.
const REQUEST_ORIGIN = "*";

function getTrustedOrigins(request: Request | undefined): string[] {
  // The mobile app's deep links are allowed as callback urls (e.g. after
  // verifying an email address).
  const origins = ["karakeep://"];
  for (const origin of serverConfig.auth.trustedOrigins) {
    if (origin === REQUEST_ORIGIN) {
      origins.push(...getRequestOrigins(request));
    } else {
      origins.push(origin);
    }
  }
  return origins;
}

function getClientIp(requestHeaders: Headers | undefined) {
  return requestIp.getClientIp({
    headers: requestHeaders ? Object.fromEntries(requestHeaders.entries()) : {},
  });
}

function getRequestEmail(body: unknown) {
  const parsed = zEmailBody.safeParse(body);
  return parsed.success ? parsed.data.email.trim().toLowerCase() : undefined;
}

async function checkRateLimit(
  path: string,
  ip: string | null,
  email: string | undefined,
) {
  const config = RATE_LIMITS[path];
  if (!config || !serverConfig.rateLimiting.enabled || !ip) {
    return;
  }
  const client = await getRateLimitClient();
  if (!client) {
    return;
  }
  const key =
    path === "/sign-in/email" ? `login:${ip}:${email ?? ""}` : `${ip}:${path}`;
  const result = await client.checkRateLimit(config, key);
  if (!result.allowed) {
    if (path === "/sign-in/email") {
      logEvent({
        "event.name": "user.login_failed",
        "user.email": email,
        "auth.failure_reason": "rate_limited",
      });
    }
    throw new APIError("TOO_MANY_REQUESTS", {
      message: `Rate limit exceeded. Try again in ${result.resetInSeconds} seconds.`,
    });
  }
}

function rejectSignUp(reason: string, message: string): never {
  logEvent({
    "event.name": "user.signup",
    "auth.provider": "credentials",
    "auth.failure_reason": reason,
  });
  throw new APIError("BAD_REQUEST", { message });
}

async function checkSignUp(body: unknown, requestHeaders: Headers | undefined) {
  if (serverConfig.auth.disableSignups) {
    logEvent({
      "event.name": "user.signup",
      "auth.provider": "credentials",
      "auth.failure_reason": "signups_disabled",
    });
    throw new APIError("FORBIDDEN", {
      message: "Signups are disabled in server config",
    });
  }

  const parsed = zSignUpBody.safeParse(body);
  if (!parsed.success) {
    rejectSignUp(
      "invalid_input",
      parsed.error.issues[0]?.message ?? "Invalid sign up request",
    );
  }

  if (serverConfig.auth.turnstile.enabled) {
    const result = await verifyTurnstileToken(
      requestHeaders?.get(TURNSTILE_TOKEN_HEADER) ?? "",
      getClientIp(requestHeaders),
    );
    if (!result.success) {
      rejectSignUp("turnstile_failed", "Turnstile verification failed");
    }
  }
}

function checkAllowed(path: string) {
  if (!ALLOWED_PATHS.has(path)) {
    throw new APIError("NOT_FOUND");
  }

  if (serverConfig.auth.disablePasswordAuth && PASSWORD_PATHS.has(path)) {
    throw new APIError("FORBIDDEN", {
      message: "Password authentication is currently disabled",
    });
  }

  if (READ_ONLY_PATHS.has(path)) {
    return;
  }
  const readOnlyError = getReadOnlyModeError(serverConfig);
  if (
    readOnlyError &&
    (serverConfig.degradedMode || !SESSION_PATHS.has(path))
  ) {
    throw new APIError("FORBIDDEN", { message: readOnlyError });
  }
}

function logSignInFailure(path: string, body: unknown, returned: unknown) {
  if (path !== "/sign-in/email" || !isAPIError(returned)) {
    return;
  }
  const failureReason =
    returned.body?.code === "EMAIL_NOT_VERIFIED"
      ? "email_not_verified"
      : returned.statusCode === 401
        ? "invalid_credentials"
        : undefined;
  if (failureReason) {
    logEvent({
      "event.name": "user.login_failed",
      "user.email": getRequestEmail(body),
      "auth.failure_reason": failureReason,
    });
  }
}

function buildVerificationUrl(email: string, token: string, url: string) {
  const verificationUrl = new URL(`${serverConfig.publicUrl}/verify-email`);
  verificationUrl.searchParams.set("token", token);
  verificationUrl.searchParams.set("email", email);
  // better-auth puts the callbackURL the client asked for (e.g. the mobile
  // app's deep link) in its own verification url.
  const redirectUrl = validateRedirectUrl(
    new URL(url).searchParams.get("callbackURL"),
  );
  if (redirectUrl && redirectUrl !== "/") {
    verificationUrl.searchParams.set("redirectUrl", redirectUrl);
  }
  return verificationUrl.toString();
}

// RFC 6749 section 2.3.1 requires the client credentials to be form-urlencoded
// before they're put in the Basic authorization header, as next-auth did.
// better-auth puts them there as is, which breaks secrets containing characters
// like "+" or "%" on providers that decode them (e.g. Keycloak and Dex). With
// client_secret_post, the secret is sent in the (already encoded) form body.
function encodeClientSecret(
  secret: string | undefined,
  authentication: "basic" | "post",
) {
  if (secret === undefined || authentication === "post") {
    return secret;
  }
  return encodeURIComponent(secret).replace(/%20/g, "+");
}

function createOAuthConfig(): GenericOAuthConfig | null {
  const oauth = serverConfig.auth.oauth;
  if (!oauth.wellKnownUrl || !oauth.clientId) {
    return null;
  }
  const authentication =
    oauth.tokenEndpointAuthMethod === "client_secret_post" ? "post" : "basic";

  return {
    providerId: CUSTOM_OAUTH_PROVIDER_ID,
    discoveryUrl: oauth.wellKnownUrl,
    clientId: oauth.clientId,
    clientSecret: encodeClientSecret(oauth.clientSecret, authentication),
    scopes: oauth.scope.split(/\s+/).filter(Boolean),
    // Keep the callback url of the next-auth days so that existing OAuth
    // client configurations keep working. See the auth route handler.
    redirectURI: `${serverConfig.publicUrl}/api/auth/callback/${CUSTOM_OAUTH_PROVIDER_ID}`,
    pkce: true,
    authentication,
    disableSignUp: serverConfig.auth.disableSignups,
    mapProfileToUser(profile: Record<string, unknown>) {
      return {
        id: String(profile.sub ?? profile.id ?? ""),
        name: normalizeSafeDisplayName(
          typeof profile.name === "string" ? profile.name : null,
        ),
        email: typeof profile.email === "string" ? profile.email : undefined,
        image:
          typeof profile.picture === "string"
            ? profile.picture
            : typeof profile.image === "string"
              ? profile.image
              : undefined,
        emailVerified:
          profile.email_verified === true || profile.emailVerified === true,
      };
    },
  };
}

const oauthConfig = createOAuthConfig();

export const oauthProviders = oauthConfig
  ? [{ id: CUSTOM_OAUTH_PROVIDER_ID, name: serverConfig.auth.oauth.name }]
  : [];

export const auth = betterAuth({
  appName: "Karakeep",
  baseURL: serverConfig.publicUrl,
  secret: serverConfig.signingSecret(),
  // NEXTAUTH_URL is always trusted on top of these.
  trustedOrigins: getTrustedOrigins,
  telemetry: { enabled: false },
  advanced: {
    // Same ids as the rest of Karakeep (see the schema's $defaultFn).
    database: { generateId: () => createId() },
    // better-auth skips origin checks when it detects a test environment. Keep
    // them on so that tests exercise them too.
    disableOriginCheck: false,
  },
  // Karakeep's own rate limiter is applied in the before hook instead, so that
  // it honors the rate limiting configuration.
  rateLimit: { enabled: false },
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: users,
      account: accounts,
      session: sessions,
      verificationToken: verificationTokens,
    },
  }),
  session: {
    expiresIn: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
    disableSessionRefresh: serverConfig.degradedMode,
  },
  emailAndPassword: {
    enabled: !serverConfig.auth.disablePasswordAuth,
    disableSignUp:
      serverConfig.auth.disableSignups || serverConfig.auth.disablePasswordAuth,
    requireEmailVerification: serverConfig.auth.emailVerificationRequired,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    password: {
      hash: hashPassword,
      verify: ({ hash, password }) => verifyPasswordHash(hash, password),
    },
    sendResetPassword: serverConfig.email.smtp
      ? async ({ user, token }) => {
          // Users that only sign in with OAuth don't have a password to reset.
          if (!(await hasPassword(db, user.id))) {
            return;
          }
          const resetUrl = `${serverConfig.publicUrl}/reset-password?token=${encodeURIComponent(token)}`;
          // Deliberately not awaited. Delivery latency is only incurred for
          // real accounts, so awaiting it would make the endpoint a timing
          // oracle for which emails are registered.
          void sendPasswordResetEmail(user.email, user.name, resetUrl).catch(
            (error) => {
              console.error("Failed to send password reset email:", error);
            },
          );
        }
      : undefined,
  },
  emailVerification: {
    sendOnSignUp: serverConfig.auth.emailVerificationRequired,
    expiresIn: 24 * 60 * 60,
    sendVerificationEmail: serverConfig.email.smtp
      ? async ({ user, url, token }) => {
          void sendVerificationEmail(
            user.email,
            user.name,
            buildVerificationUrl(user.email, token, url),
          ).catch((error) => {
            console.error("Failed to send verification email:", error);
          });
        }
      : undefined,
  },
  user: {
    additionalFields: {
      role: {
        type: ["admin", "user"],
        input: false,
        defaultValue: "user",
      },
      bookmarkQuota: {
        type: "number",
        required: false,
        input: false,
        returned: false,
      },
      storageQuota: {
        type: "number",
        required: false,
        input: false,
        returned: false,
      },
    },
  },
  account: {
    // Mirrors next-auth's allowDangerousEmailAccountLinking: an OAuth login is
    // only linked to an existing user with the same email when explicitly
    // allowed, and in that case regardless of email verification status.
    accountLinking: {
      enabled: true,
      disableImplicitLinking:
        !serverConfig.auth.oauth.allowDangerousEmailAccountLinking,
      requireLocalEmailVerified: false,
      trustedProviders: serverConfig.auth.oauth
        .allowDangerousEmailAccountLinking
        ? [CUSTOM_OAUTH_PROVIDER_ID]
        : [],
    },
  },
  verification: { modelName: "verificationToken" },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          assertWritesAllowed();
          return {
            data: {
              ...user,
              name: normalizeSafeDisplayName(user.name),
              role: (await isFirstUser()) ? "admin" : "user",
              bookmarkQuota: serverConfig.quotas.free.bookmarkLimit,
              storageQuota: serverConfig.quotas.free.assetSizeBytes,
            },
          };
        },
        after: async (user, context) => {
          logEvent({
            "event.name": "user.signup",
            "user.id": user.id,
            "auth.provider":
              context?.path === "/sign-up/email" ? "credentials" : "oauth",
          });
        },
      },
    },
    account: {
      create: {
        before: async () => {
          assertWritesAllowed();
        },
      },
    },
    session: {
      create: {
        after: async (session, context) => {
          logEvent({
            "event.name": "user.login",
            "user.id": session.userId,
            "auth.provider": context?.path.startsWith("/oauth2/")
              ? "oauth"
              : "credentials",
          });
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      checkAllowed(ctx.path);
      await checkRateLimit(
        ctx.path,
        getClientIp(ctx.headers),
        getRequestEmail(ctx.body),
      );
      if (ctx.path === "/sign-up/email") {
        await checkSignUp(ctx.body, ctx.headers);
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned;
      logSignInFailure(ctx.path, ctx.body, returned);
      if (ctx.path === "/change-password" && !isAPIError(returned)) {
        logEvent({ "event.name": "user.password_change" });
      }
    }),
  },
  onAPIError: {
    errorURL: "/signin",
  },
  plugins: oauthConfig ? [genericOAuth({ config: [oauthConfig] })] : [],
});

async function fetchServerAuthSession(): Promise<AuthSession | null> {
  let session;
  try {
    session = await auth.api.getSession({
      headers: await headers(),
      // Server components can't set cookies, so refreshing the session here
      // would extend it in the database without extending the cookie. The
      // client side session fetch refreshes it instead.
      query: { disableRefresh: true },
    });
  } catch (e) {
    // In degraded mode the database is read-only, and better-auth can still
    // try to clean up expired sessions. Treat that as being logged out.
    if (serverConfig.degradedMode) {
      return null;
    }
    throw e;
  }
  if (!session) {
    return null;
  }

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
      role: session.user.role === "admin" ? "admin" : "user",
    },
    expires: session.session.expiresAt.toISOString(),
  };
}

// Deduplicated per request: many server components need the session.
export const getServerAuthSession = cache(fetchServerAuthSession);
