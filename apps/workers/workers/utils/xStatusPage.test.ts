import { describe, expect, test } from "vitest";

import { extractXStatusId } from "./xStatusPage";

describe("extractXStatusId", () => {
  test("extracts status ID from x.com URL", () => {
    expect(
      extractXStatusId("https://x.com/user/status/1234567890"),
    ).toBe("1234567890");
  });

  test("extracts status ID from twitter.com URL", () => {
    expect(
      extractXStatusId("https://twitter.com/user/status/9876543210"),
    ).toBe("9876543210");
  });

  test("extracts status ID from relative path", () => {
    expect(extractXStatusId("/user/status/111222333")).toBe("111222333");
  });

  test("returns null for non-status URLs", () => {
    expect(extractXStatusId("https://x.com/user/article/123")).toBeNull();
    expect(extractXStatusId("https://example.com")).toBeNull();
  });
});
