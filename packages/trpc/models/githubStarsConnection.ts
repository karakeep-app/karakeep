import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@karakeep/db";
import {
  githubStarsAuthorizations,
  githubStarsConnections,
} from "@karakeep/db/schema";
import config from "@karakeep/shared/config";

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
});
const credentialsSchema = z.object({
  accessToken: z.string(),
  expiresAt: z.number().nullable(),
  refreshToken: z.string().optional(),
  refreshExpiresAt: z.number().nullable(),
});
const message = "GitHub connection failed. Please connect your account again.";
const callbackUrl = () => `${config.publicUrl}/api/github-stars/callback`;
export const githubConnectionAvailable = () =>
  !!(config.githubStars.clientId && config.githubStars.clientSecret);

// Bind encrypted credentials to both their owner and purpose.
function key() {
  return Buffer.from(
    hkdfSync("sha256", config.signingSecret(), "", "karakeep-github-stars", 32),
  );
}
export function sealGithubSecret(value: string, owner: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(owner));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function openGithubSecret(value: string, owner: string) {
  const data = Buffer.from(value, "base64url");
  const cipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  cipher.setAAD(Buffer.from(owner));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    cipher.update(data.subarray(28)),
    cipher.final(),
  ]).toString("utf8");
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("base64url");

export function beginGithubConnection(db: DB, userId: string) {
  if (!githubConnectionAvailable())
    throw new Error(
      "GitHub connection is not configured by this server's administrator.",
    );
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const pending = {
    stateHash: hash(state),
    verifier: sealGithubSecret(verifier, `state:${userId}`),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  };
  db.insert(githubStarsAuthorizations)
    .values({ userId, ...pending })
    .onConflictDoUpdate({
      target: githubStarsAuthorizations.userId,
      set: pending,
    })
    .run();
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: config.githubStars.clientId!,
    redirect_uri: callbackUrl(),
    state,
    code_challenge: hash(verifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

async function exchange(parameters: Record<string, string>) {
  if (!githubConnectionAvailable()) throw new Error(message);
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.githubStars.clientId!,
      client_secret: config.githubStars.clientSecret!,
      ...parameters,
    }),
  });
  if (!response.ok) throw new Error(message);
  const parsed = tokenSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error(message);
  const token = parsed.data;
  return {
    accessToken: token.access_token,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
    refreshToken: token.refresh_token,
    refreshExpiresAt: token.refresh_token_expires_in
      ? Date.now() + token.refresh_token_expires_in * 1000
      : null,
  };
}

export async function completeGithubConnection(
  db: DB,
  userId: string,
  state: string,
  code: string,
) {
  const pending = db
    .update(githubStarsAuthorizations)
    .set({ stateHash: "" })
    .where(
      and(
        eq(githubStarsAuthorizations.userId, userId),
        eq(githubStarsAuthorizations.stateHash, hash(state)),
        gt(githubStarsAuthorizations.expiresAt, new Date()),
      ),
    )
    .returning()
    .get();
  if (!pending)
    throw new Error(
      "GitHub authorization expired or does not belong to this session. Start again.",
    );
  const token = await exchange({
    code,
    redirect_uri: callbackUrl(),
    code_verifier: openGithubSecret(pending.verifier, `state:${userId}`),
  });
  const response = await fetch("https://api.github.com/user", {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Karakeep",
    },
  });
  if (!response.ok) throw new Error(message);
  const profile = z
    .object({ login: z.string().regex(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/) })
    .parse(await response.json());
  db.transaction(
    (tx) => {
      const attempt = tx
        .delete(githubStarsAuthorizations)
        .where(
          and(
            eq(githubStarsAuthorizations.userId, userId),
            eq(githubStarsAuthorizations.stateHash, ""),
            eq(githubStarsAuthorizations.verifier, pending.verifier),
          ),
        )
        .returning()
        .get();
      if (!attempt)
        throw new Error("GitHub connection was cancelled. Start again.");
      // Replacing the identity invalidates queued jobs for the previous connection.
      tx.delete(githubStarsConnections)
        .where(eq(githubStarsConnections.userId, userId))
        .run();
      tx.insert(githubStarsConnections)
        .values({
          userId,
          login: profile.login,
          credentials: sealGithubSecret(
            JSON.stringify(token),
            `token:${userId}`,
          ),
        })
        .run();
    },
    { behavior: "immediate" },
  );
}

export async function getGithubAccessToken(db: DB, connectionId: string) {
  const connection = db
    .select()
    .from(githubStarsConnections)
    .where(eq(githubStarsConnections.id, connectionId))
    .get();
  if (!connection) throw new Error(message);
  let token = credentialsSchema.parse(
    JSON.parse(
      openGithubSecret(connection.credentials, `token:${connection.userId}`),
    ),
  );
  if (token.expiresAt !== null && token.expiresAt <= Date.now() + 60_000) {
    if (
      !token.refreshToken ||
      (token.refreshExpiresAt !== null && token.refreshExpiresAt <= Date.now())
    )
      throw new Error(message);
    token = await exchange({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    });
    const updated = db
      .update(githubStarsConnections)
      .set({
        credentials: sealGithubSecret(
          JSON.stringify(token),
          `token:${connection.userId}`,
        ),
      })
      .where(
        and(
          eq(githubStarsConnections.id, connection.id),
          eq(githubStarsConnections.credentials, connection.credentials),
        ),
      )
      .run();
    if (updated.changes !== 1) throw new Error(message);
  }
  return token.accessToken;
}
