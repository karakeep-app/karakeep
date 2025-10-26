import { createHash, randomBytes } from "crypto";
import * as bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { apiKeys } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";

import type { Context } from "./index";

const BCRYPT_SALT_ROUNDS = 10;
const API_KEY_PREFIX_V1 = "ak1";
const API_KEY_PREFIX_V2 = "ak2";
const CREDENTIAL_PASSWORD_VERSION = 1;

const zCredentialPasswordPayload = z.object({
  hash: z.string(),
  salt: z.string().optional(),
  v: z.number(),
});

function encodeCredentialPassword(
  hash: string,
  salt: string | null | undefined = undefined,
): string {
  return JSON.stringify({
    v: CREDENTIAL_PASSWORD_VERSION,
    hash,
    salt: salt ?? undefined,
  } satisfies z.infer<typeof zCredentialPasswordPayload>);
}

function decodeCredentialPassword(
  value: string | null | undefined,
): z.infer<typeof zCredentialPasswordPayload> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = zCredentialPasswordPayload.safeParse(JSON.parse(value));
    if (parsed.success) {
      return parsed.data;
    } else {
      return null;
    }
  } catch {
    return null;
  }
}

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
      })
      .returning()
  )[0];

  return {
    id: key.id,
    name: key.name,
    createdAt: key.createdAt,
    key: plain,
  };
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
    case 2:
      validation =
        createHash("sha256").update(keySecret).digest("base64") == hash;
      break;
    default:
      throw new Error("Invalid API Key");
  }

  if (!validation) {
    throw new Error("Invalid API Key");
  }

  return apiKey.user;
}

export async function hashPassword(password: string) {
  const hashed = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  return encodeCredentialPassword(hashed);
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  const payload = decodeCredentialPassword(hash);
  if (!payload) {
    return false;
  }
  try {
    const saltAugmentedPassword = `${password}${payload.salt ?? ""}`;
    const match = await bcrypt.compare(saltAugmentedPassword, payload.hash);
    return match;
  } catch {
    return false;
  }
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
    where: (u, { eq }) => eq(u.email, email),
    with: {
      accounts: {
        where: (a, { eq }) => eq(a.providerId, "credential"),
        columns: {
          password: true,
        },
      },
    },
  });

  if (!user) {
    // Run a bcrypt comparison anyways to hide the fact of whether the user exists or not (protecting against timing attacks)
    await bcrypt.compare(
      password +
        "b6bfd1e907eb40462e73986f6cd628c036dc079b101186d36d53b824af3c9d2e",
      "a-dummy-password-that-should-never-match",
    );
    throw new Error("User not found");
  }

  if (user.accounts.length != 1 || !user.accounts[0].password) {
    throw new Error("This user doesn't have a password defined");
  }

  if (await verifyPassword({ hash: user.accounts[0].password, password })) {
    return user;
  } else {
    throw new Error("Wrong password");
  }
}
