import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createSignedToken,
  getAlignedExpiry,
  SignedTokenPayload,
  verifySignedToken,
} from "./signedTokens";

const SECRET = "secret";

describe("getAlignedExpiry", () => {
  it("should align to next interval when within grace period", () => {
    const now = new Date("2023-01-01T12:29:30Z"); // 30 seconds before next interval
    const expiry = getAlignedExpiry(1800, 60, now); // 30min interval, 60s grace
    expect(expiry).toBe(new Date("2023-01-01T13:00:00Z").getTime());
  });

  it("should align to current interval when outside grace period", () => {
    const now = new Date("2023-01-01T12:10:01Z");
    const expiry = getAlignedExpiry(1800, 60, now); // 30min interval, 60s grace
    expect(expiry).toBe(new Date("2023-01-01T12:30:00Z").getTime());
  });

  it("should handle exact interval boundary", () => {
    const now = new Date("2023-01-01T12:00:00Z");
    const expiry = getAlignedExpiry(1800, 60, now);
    expect(expiry).toBe(new Date("2023-01-01T12:30:00Z").getTime());
  });
});

describe("signed tokens", () => {
  const testSchema = z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .strict();

  const testPayload = {
    id: "123",
    name: "John",
  };

  it("should create and verify valid token", () => {
    const token = createSignedToken(testPayload, SECRET);
    const verified = verifySignedToken(token, SECRET, testSchema);
    expect(verified).toEqual(testPayload);
  });

  it("should return null for expired token", () => {
    const token = createSignedToken(testPayload, SECRET, Date.now() - 1000);
    const verified = verifySignedToken(token, SECRET, testSchema);
    expect(verified).toBeNull();
  });

  it("should return null for invalid signature", () => {
    const token = createSignedToken(testPayload, SECRET);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const decoded: SignedTokenPayload = JSON.parse(
      Buffer.from(token, "base64").toString(),
    );
    decoded.signature = "tampered" + decoded.signature;
    const tampered = Buffer.from(JSON.stringify(decoded)).toString("base64");
    const verified = verifySignedToken(tampered, SECRET, testSchema);
    expect(verified).toBeNull();
  });

  it("should return null if payload doesn't match schema", () => {
    const invalidPayload = { ...testPayload, extra: "field" };
    const token = createSignedToken(invalidPayload, SECRET);
    const verified = verifySignedToken(token, SECRET, testSchema);
    expect(verified).toBeNull();
  });

  it("should fail with different signing secrets", () => {
    const token = createSignedToken(testPayload, "ONE SECRET");
    const verified = verifySignedToken(token, "ANOTHER SECRET", testSchema);
    expect(verified).toBeNull();
  });
});
