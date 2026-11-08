import { describe, expect, it } from "vitest";

import { defaultUserLocalSettings, parseUserLocalSettings } from "./types";

describe("user local settings", () => {
  it("defaults the sort order to newest first", () => {
    expect(defaultUserLocalSettings().sortOrder).toBe("desc");
  });

  it("parses a saved sort order", () => {
    expect(
      parseUserLocalSettings(JSON.stringify({ sortOrder: "asc" }))?.sortOrder,
    ).toBe("asc");
  });

  it("rejects search-only sort orders", () => {
    expect(
      parseUserLocalSettings(JSON.stringify({ sortOrder: "relevance" })),
    ).toBeUndefined();
  });
});
