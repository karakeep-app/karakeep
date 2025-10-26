import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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
import { hashPassword, verifyPassword } from "@karakeep/trpc/auth";
import { sendPasswordResetEmail } from "@karakeep/trpc/email";

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
          redirectURI: `${serverConfig.publicApiUrl}/auth/callback/custom`,
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
      verificationToken: verificationTokens,
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
  account: {
    modelName: "account",
    fields: {
      updatedAt: "modifiedAt",
    },
    accountLinking: {
      enabled: oauthConfig.allowDangerousEmailAccountLinking,
    },
  },
  session: {
    modelName: "session",
    fields: {
      updatedAt: "modifiedAt",
    },
  },
  verification: {
    modelName: "verificationToken",
    fields: {
      value: "token",
      expiresAt: "expires",
      updatedAt: "modifiedAt",
    },
  },
  emailAndPassword: serverConfig.auth.disablePasswordAuth
    ? { enabled: false }
    : {
        enabled: true,
        disableSignUp: serverConfig.auth.disableSignups,
        requireEmailVerification: serverConfig.auth.emailVerificationRequired,
        password: {
          hash: hashPassword,
          verify: verifyPassword,
        },
        sendResetPassword: async ({ user, token }) => {
          await sendPasswordResetEmail(user.email, user.name, token);
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
