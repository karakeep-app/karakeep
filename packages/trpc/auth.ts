import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";

import { accounts, apiKeys } from "@karakeep/db/schema";
import type { ZApiKeyScope } from "@karakeep/shared/types/apiKeys";
import { API_KEY_FULL_ACCESS_SCOPE } from "@karakeep/shared/types/apiKeys";
import serverConfig from "@karakeep/shared/config";
import { getReadOnlyModeError } from "@karakeep/shared/readOnlyMode";

import type { Context } from "./index";

const BCRYPT_SALT_ROUNDS = 10;
const API_KEY_PREFIX_V1 = "ak1";
const API_KEY_PREFIX_V2 = "ak2";

// A *real* bcrypt hash of a random secret, used to burn the same amount of CPU
// on login paths that have no password to check against. It must be a valid
// hash at the same cost factor as real passwords: bcrypt parses the hash to
// recover the cost and salt, so handing it an arbitrary string makes it bail
// out immediately without deriving anything, which is exactly the timing leak
// these comparisons exist to close. Nothing can match it -- the input is
// random and thrown away.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  randomBytes(32).toString("hex"),
  BCRYPT_SALT_ROUNDS,
);

function generateApiKeySecret() {
  const secret = randomBytes(16).toString("hex");
  return {
    keyId: randomBytes(10).toString("hex"),
    secret,
    secretHash: createHash("sha256").update(secret).digest("base64"),
  };
}

export async function regenerateApiKey(
  id: string,
  userId: string,
  database: Context["db"],
) {
  const { keyId, secret, secretHash } = generateApiKeySecret();

  const plain = `${API_KEY_PREFIX_V2}_${keyId}_${secret}`;

  const res = await database
    .update(apiKeys)
    .set({
      keyId: keyId,
      keyHash: secretHash,
    })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));

  if (res.changes == 0) {
    throw new Error("Failed to regenerate API key");
  }
  return plain;
}

export async function generateApiKey(
  name: string,
  userId: string,
  database: Context["db"],
  scopes: ZApiKeyScope[],
) {
  const { keyId, secret, secretHash } = generateApiKeySecret();

  const plain = `${API_KEY_PREFIX_V2}_${keyId}_${secret}`;

  const key = (
    await database
      .insert(apiKeys)
      .values({
        name: name,
        userId: userId,
        keyId,
        keyHash: secretHash,
        scopes,
      })
      .returning()
  )[0];

  return {
    id: key.id,
    name: key.name,
    createdAt: key.createdAt,
    scopes: normalizeApiKeyScopes(key.scopes),
    key: plain,
  };
}

function normalizeApiKeyScopes(
  scopes: ZApiKeyScope[] | null | undefined,
): ZApiKeyScope[] {
  return scopes?.length ? scopes : [API_KEY_FULL_ACCESS_SCOPE];
}

function parseApiKey(plain: string) {
  const parts = plain.split("_");
  if (parts.length != 3) {
    throw new Error(
      `Malformd API key. API keys should have 3 segments, found ${parts.length} instead.`,
    );
  }
  if (parts[0] !== API_KEY_PREFIX_V1 && parts[0] !== API_KEY_PREFIX_V2) {
    throw new Error(`Malformd API key. Got unexpected key prefix.`);
  }
  return {
    version: parts[0] == API_KEY_PREFIX_V1 ? (1 as const) : (2 as const),
    keyId: parts[1],
    keySecret: parts[2],
  };
}

export async function authenticateApiKey(key: string, database: Context["db"]) {
  const { version, keyId, keySecret } = parseApiKey(key);
  const apiKey = await database.query.apiKeys.findFirst({
    where: (k, { eq }) => eq(k.keyId, keyId),
    with: {
      user: true,
    },
  });

  if (!apiKey) {
    throw new Error("API key not found");
  }

  const hash = apiKey.keyHash;

  let validation = false;
  switch (version) {
    case 1:
      validation = await bcrypt.compare(keySecret, hash);
      break;
    case 2: {
      const candidateHash = createHash("sha256").update(keySecret).digest();
      const expectedHash = Buffer.from(hash, "base64");
      validation =
        candidateHash.length === expectedHash.length &&
        timingSafeEqual(candidateHash, expectedHash);
      break;
    }
    default:
      throw new Error("Invalid API Key");
  }

  if (!validation) {
    throw new Error("Invalid API Key");
  }

  // Update lastUsedAt with 10-minute throttle to avoid excessive DB writes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  if (
    !getReadOnlyModeError(serverConfig) &&
    (!apiKey.lastUsedAt || apiKey.lastUsedAt < tenMinutesAgo)
  ) {
    // Fire and forget - don't await to avoid blocking the auth response
    database
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, apiKey.id))
      .catch((err) => {
        console.error("Failed to update API key lastUsedAt:", err);
      });
  }

  return {
    user: apiKey.user,
    apiKey: {
      id: apiKey.id,
      keyId: apiKey.keyId,
      scopes: normalizeApiKeyScopes(apiKey.scopes),
    },
  };
}

// better-auth's provider id for email/password accounts. Their accountId is the
// user's id.
export const CREDENTIAL_PROVIDER_ID = "credential";

// Passwords set before the migration to better-auth were hashed as
// bcrypt(password + salt). They're stored as `bcrypt-salted:<salt>:<hash>`.
const SALTED_BCRYPT_PREFIX = "bcrypt-salted:";

export async function hashPassword(password: string) {
  return await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export async function verifyPasswordHash(hash: string, password: string) {
  if (!hash.startsWith(SALTED_BCRYPT_PREFIX)) {
    return await bcrypt.compare(password, hash);
  }
  const saltAndHash = hash.slice(SALTED_BCRYPT_PREFIX.length);
  const separator = saltAndHash.indexOf(":");
  if (separator === -1) {
    return false;
  }
  return await bcrypt.compare(
    password + saltAndHash.slice(0, separator),
    saltAndHash.slice(separator + 1),
  );
}

async function getCredentialAccount(database: Context["db"], userId: string) {
  return await database.query.accounts.findFirst({
    columns: { password: true },
    where: and(
      eq(accounts.userId, userId),
      eq(accounts.providerId, CREDENTIAL_PROVIDER_ID),
    ),
  });
}

export async function hasPassword(database: Context["db"], userId: string) {
  const account = await getCredentialAccount(database, userId);
  return !!account?.password;
}

export async function verifyUserPassword(
  database: Context["db"],
  userId: string,
  password: string,
) {
  const account = await getCredentialAccount(database, userId);
  if (!account?.password) {
    // Returning early would make accounts without a password (OAuth-only)
    // measurably faster to probe than password accounts.
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return false;
  }
  return await verifyPasswordHash(account.password, password);
}

export async function setUserPassword(
  database: Context["db"],
  userId: string,
  password: string,
) {
  const hash = await hashPassword(password);
  await database
    .insert(accounts)
    .values({
      userId,
      accountId: userId,
      providerId: CREDENTIAL_PROVIDER_ID,
      password: hash,
    })
    .onConflictDoUpdate({
      target: [accounts.providerId, accounts.accountId],
      set: { password: hash, updatedAt: new Date() },
    });
}

export async function validatePassword(
  email: string,
  password: string,
  database: Context["db"],
) {
  if (serverConfig.auth.disablePasswordAuth) {
    throw new Error("Password authentication is currently disabled");
  }
  const user = await database.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, email.toLowerCase()),
  });

  if (!user) {
    // Run a bcrypt comparison anyways to hide the fact of whether the user exists or not (protecting against timing attacks)
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    throw new Error("User not found");
  }

  if (!(await verifyUserPassword(database, user.id, password))) {
    throw new Error("Wrong password");
  }

  return user;
}
