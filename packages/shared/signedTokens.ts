import crypto from "node:crypto";
import { z } from "zod";

const zTokenPayload = z.object({
  payload: z.unknown(),
  expiresAt: z.number(),
});

const zSignedTokenPayload = z.object({
  payload: zTokenPayload,
  signature: z.string(),
});

/**
 * Returns the expiry date aligned to the specified interval.
 * If the time left until the next interval is less than the grace period,
 * it skips to the following interval.
 *
 * @param now - The current date and time (defaults to new Date()).
 * @param intervalSeconds - The interval in seconds (e.g., 1800 for 30 mins).
 * @param gracePeriodSeconds - The grace period in seconds.
 * @returns The calculated expiry Date.
 */
export function getAlignedExpiry(
  intervalSeconds: number,
  gracePeriodSeconds: number,
  now: Date = new Date(),
): number {
  const ms = now.getTime();
  const intervalMs = intervalSeconds * 1000;

  // Find the next interval
  const nextIntervalTime =
    Math.floor(ms / intervalMs) * intervalMs + intervalMs;

  // Time left until the next interval
  const timeLeft = nextIntervalTime - ms;

  // Decide which interval to use
  const finalIntervalTime =
    timeLeft < gracePeriodSeconds * 1000
      ? nextIntervalTime + intervalMs
      : nextIntervalTime;

  return finalIntervalTime;
}

export type SignedTokenPayload = z.infer<typeof zSignedTokenPayload>;

export function createSignedToken(
  payload: unknown,
  secret: string,
  expiryEpoch?: number,
): string {
  const expiresAt = expiryEpoch ?? Date.now() + 5 * 60 * 1000; // 5 minutes from now

  const toBeSigned: z.infer<typeof zTokenPayload> = {
    payload,
    expiresAt,
  };

  const payloadString = JSON.stringify(toBeSigned);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadString)
    .digest("hex");

  const tokenData: z.infer<typeof zSignedTokenPayload> = {
    payload: toBeSigned,
    signature,
  };

  return Buffer.from(JSON.stringify(tokenData)).toString("base64");
}

export function verifySignedToken<T>(
  token: string,
  secret: string,
  schema: z.ZodSchema<T>,
): T | null {
  try {
    const tokenData = zSignedTokenPayload.parse(
      JSON.parse(Buffer.from(token, "base64").toString()),
    );
    const { payload, signature } = tokenData;

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(payload))
      .digest("hex");

    if (signature !== expectedSignature) {
      return null;
    }
    // Check expiry
    if (Date.now() > payload.expiresAt) {
      return null;
    }

    return schema.parse(payload.payload);
  } catch {
    return null;
  }
}
