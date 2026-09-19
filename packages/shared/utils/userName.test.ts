import { describe, expect, it } from "vitest";

import {
  containsUnsafeUserNameMarkup,
  normalizeUserNameInput,
  resolveOAuthDisplayName,
} from "./userName";

describe("normalizeUserNameInput", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeUserNameInput("  Jane Doe  ")).toBe("Jane Doe");
  });
});

describe("containsUnsafeUserNameMarkup", () => {
  it("detects angle brackets", () => {
    expect(containsUnsafeUserNameMarkup("<script>")).toBe(true);
    expect(containsUnsafeUserNameMarkup("Jane Doe")).toBe(false);
  });
});

describe("resolveOAuthDisplayName", () => {
  it("prefers the full name when present", () => {
    expect(resolveOAuthDisplayName("Jane Doe", "Jane", "Doe")).toBe("Jane Doe");
  });

  it("combines given and family names when the full name is missing", () => {
    expect(resolveOAuthDisplayName(undefined, "Jane", "Doe")).toBe("Jane Doe");
  });

  it("falls back to the given name when the family name is missing", () => {
    expect(resolveOAuthDisplayName(undefined, "Jane", undefined)).toBe("Jane");
  });

  it("falls back to the family name when the given name is missing", () => {
    expect(resolveOAuthDisplayName(null, null, "Doe")).toBe("Doe");
  });

  it("ignores empty strings when combining names", () => {
    expect(resolveOAuthDisplayName("", "Jane", "")).toBe("Jane");
  });

  it("ignores a whitespace-only full name and falls back to the components", () => {
    expect(resolveOAuthDisplayName("   ", "Jane", "Doe")).toBe("Jane Doe");
  });

  it("trims surrounding whitespace in the components", () => {
    expect(resolveOAuthDisplayName(undefined, "  Jane  ", "  Doe  ")).toBe(
      "Jane Doe",
    );
  });

  it("drops whitespace-only components", () => {
    expect(resolveOAuthDisplayName(undefined, "   ", "Doe")).toBe("Doe");
  });

  it("returns undefined when no usable name is provided", () => {
    expect(resolveOAuthDisplayName(undefined, undefined, undefined)).toBe(
      undefined,
    );
    expect(resolveOAuthDisplayName("", "", "")).toBe(undefined);
  });
});
