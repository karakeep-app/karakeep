import { describe, expect, it } from "vitest";

import { isInstagramUrl } from "./instagram";

describe("isInstagramUrl", () => {
  it("accepts post, reel, reels and tv URLs", () => {
    expect(isInstagramUrl("https://www.instagram.com/p/ABC123/")).toBe(true);
    expect(isInstagramUrl("https://instagram.com/reel/ABC123/")).toBe(true);
    expect(isInstagramUrl("https://www.instagram.com/reels/ABC123")).toBe(true);
    expect(isInstagramUrl("https://www.instagram.com/tv/ABC123/")).toBe(true);
  });

  it("rejects profile, non-instagram and lookalike hosts", () => {
    expect(isInstagramUrl("https://www.instagram.com/someuser/")).toBe(false);
    expect(isInstagramUrl("https://example.com/p/ABC123/")).toBe(false);
    expect(isInstagramUrl("https://instagram.com.evil.com/p/ABC123/")).toBe(
      false,
    );
    expect(isInstagramUrl("not a url")).toBe(false);
  });
});
