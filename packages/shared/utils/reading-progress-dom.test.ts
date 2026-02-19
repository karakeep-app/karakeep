import { describe, expect, test } from "vitest";

import { normalizeText, normalizeTextLength } from "./reading-progress-dom";

describe("normalizeText", () => {
  test("collapses multiple spaces to single space", () => {
    expect(normalizeText("hello    world")).toBe("hello world");
  });

  test("collapses newlines and tabs to single space", () => {
    expect(normalizeText("hello\n\nworld")).toBe("hello world");
    expect(normalizeText("hello\t\tworld")).toBe("hello world");
    expect(normalizeText("hello\r\nworld")).toBe("hello world");
  });

  test("trims leading and trailing whitespace", () => {
    expect(normalizeText("  hello world  ")).toBe("hello world");
    expect(normalizeText("\n\nhello world\n\n")).toBe("hello world");
  });

  test("handles empty string", () => {
    expect(normalizeText("")).toBe("");
  });

  test("handles whitespace-only string", () => {
    expect(normalizeText("   ")).toBe("");
    expect(normalizeText("\n\t\r")).toBe("");
  });

  test("handles text with no extra whitespace", () => {
    expect(normalizeText("hello world")).toBe("hello world");
  });

  test("handles mixed whitespace types", () => {
    expect(normalizeText("hello  \n\t  world")).toBe("hello world");
  });
});

describe("normalizeTextLength", () => {
  test("returns length of normalized text", () => {
    expect(normalizeTextLength("hello world")).toBe(11);
  });

  test("returns normalized length for text with extra whitespace", () => {
    // "hello    world" normalizes to "hello world" (11 chars)
    expect(normalizeTextLength("hello    world")).toBe(11);
  });

  test("returns 0 for empty string", () => {
    expect(normalizeTextLength("")).toBe(0);
  });

  test("returns 0 for whitespace-only string", () => {
    expect(normalizeTextLength("   \n\t")).toBe(0);
  });
});
