import { describe, expect, it } from "vitest";

import { isValidMetadataValue, parseIsoDateValue } from "./htmlMetadata";

describe("isValidMetadataValue", () => {
  it("rejects interstitial phrases as publisher names", () => {
    for (const bad of [
      "Prove your humanity",
      "Just a moment...",
      "Access Denied",
      "Are you a robot?",
      "Log in or sign up to view",
    ]) {
      expect(isValidMetadataValue(bad, { propName: "publisher" })).toBe(false);
    }
    expect(isValidMetadataValue("Reddit", { propName: "publisher" })).toBe(
      true,
    );
  });

  it("rejects numeric and UI-label author values", () => {
    expect(isValidMetadataValue("123456", { propName: "author" })).toBe(false);
    expect(isValidMetadataValue("Changes by", { propName: "author" })).toBe(
      false,
    );
    expect(isValidMetadataValue("Jane Doe", { propName: "author" })).toBe(true);
  });
});

describe("parseIsoDateValue", () => {
  it("normalizes valid ISO timestamps and ignores invalid values", () => {
    expect(parseIsoDateValue("2009-10-24T23:57:33-07:00")).toBe(
      "2009-10-25T06:57:33.000Z",
    );
    expect(parseIsoDateValue("")).toBeUndefined();
    expect(parseIsoDateValue("not-a-date")).toBeUndefined();
    expect(parseIsoDateValue(null)).toBeUndefined();
  });
});
