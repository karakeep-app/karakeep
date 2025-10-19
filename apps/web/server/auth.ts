import { headers } from "next/headers";
import * as bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { verifyPassword as defaultVerifyPassword } from "better-auth/crypto";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins";
import { count } from "drizzle-orm";

import { db } from "@karakeep/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import {
  CredentialPasswordPayload,
  decodeCredentialPassword,
  encodeCredentialPassword,
  generatePasswordSalt,
  hashPassword,
} from "@karakeep/trpc/auth";

function createCredentialPasswordPayload(
  hash: string,
  salt: string | null | undefined,
): string {
  return encodeCredentialPassword(hash, salt ?? "");
}

function parseCredentialPassword(
  value: string | null | undefined,
): CredentialPasswordPayload | null {
  return decodeCredentialPassword(value);
}

async function customHashPassword(password: string): Promise<string> {
  const salt = generatePasswordSalt();
  const hashed = await hashPassword(password, salt);
  return createCredentialPasswordPayload(hashed, salt);
}

async function customVerifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  const payload = parseCredentialPassword(hash);
  if (payload) {
    try {
      const saltAugmentedPassword = `${password}${payload.salt ?? ""}`;
      const match = await bcrypt.compare(saltAugmentedPassword, payload.hash);
      if (match) {
        return true;
      }
    } catch {
      // fall through to default verifier
    }
  }
  try {
    return await defaultVerifyPassword({ hash, password });
  } catch {
    return false;
  }
}

async function isFirstUser(): Promise<boolean> {
  const [{ count: userCount }] = await db
    .select({ count: count() })
    .from(users);
  return userCount === 0;
}

const oauthConfig = serverConfig.auth.oauth;

const plugins = [];

if (
  oauthConfig.wellKnownUrl &&
  oauthConfig.clientId &&
  oauthConfig.clientSecret
) {
  plugins.push(
    genericOAuth({
      config: [
        {
          providerId: "custom",
          discoveryUrl: oauthConfig.wellKnownUrl,
          clientId: oauthConfig.clientId,
          clientSecret: oauthConfig.clientSecret,
          scopes: oauthConfig.scope.split(" "),
        },
      ],
    }),
  );
}

plugins.push(nextCookies());

export const auth = betterAuth({
  basePath: "/api/auth",
  secret: serverConfig.signingSecret(),
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verificationTokens,
    },
  }),
  user: {
    modelName: "user",
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
      bookmarkQuota: {
        type: "number",
        required: false,
        input: false,
      },
      storageQuota: {
        type: "number",
        required: false,
        input: false,
      },
      browserCrawlingEnabled: {
        type: "boolean",
        required: false,
        input: false,
      },
    },
  },
  session: {
    modelName: "session",
    fields: {
      id: "sessionToken",
      token: "sessionToken",
      expiresAt: "expires",
      userId: "userId",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
      ipAddress: "ipAddress",
      userAgent: "userAgent",
    },
  },
  account: {
    modelName: "account",
    fields: {
      accountId: "providerAccountId",
      providerId: "provider",
      userId: "userId",
      password: "session_state",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      accessTokenExpiresAt: "expires_at",
      scope: "scope",
      idToken: "id_token",
    },
    accountLinking: {
      enabled: oauthConfig.allowDangerousEmailAccountLinking,
    },
  },
  verification: {
    modelName: "verificationToken",
    fields: {
      identifier: "identifier",
      value: "token",
      expiresAt: "expires",
    },
  },
  emailAndPassword: serverConfig.auth.disablePasswordAuth
    ? { enabled: false }
    : {
        enabled: true,
        disableSignUp: serverConfig.auth.disableSignups,
        requireEmailVerification: serverConfig.auth.emailVerificationRequired,
        password: {
          hash: customHashPassword,
          verify: customVerifyPassword,
        },
      },
  plugins,
  databaseHooks: {
    user: {
      create: {
        before: async (userData) => {
          const firstUser = await isFirstUser();
          return {
            data: {
              ...userData,
              email: userData.email?.toLowerCase() ?? userData.email,
              role:
                (userData.role as "admin" | "user" | undefined) ??
                (firstUser ? "admin" : "user"),
              bookmarkQuota:
                userData.bookmarkQuota ??
                serverConfig.quotas.free.bookmarkLimit ??
                null,
              storageQuota:
                userData.storageQuota ??
                serverConfig.quotas.free.assetSizeBytes ??
                null,
              browserCrawlingEnabled:
                userData.browserCrawlingEnabled ??
                serverConfig.quotas.free.browserCrawlingEnabled ??
                null,
            },
          };
        },
      },
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;

export async function getServerAuthSession(): Promise<AuthSession | null> {
  try {
    return await auth.api.getSession({
      headers: await headers(),
    });
  } catch {
    return null;
  }
}
