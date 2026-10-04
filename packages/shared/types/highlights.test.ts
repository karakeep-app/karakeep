import { describe, expect, it } from "vitest";
import { zHighlightContentSchema, zNewHighlightSchema } from "./highlights";

describe("rich highlight schema", () => {
  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "file:///private.png",
  ])("rejects image URL %s", (src) => {
    expect(
      zHighlightContentSchema.safeParse({
        version: 1,
        parts: [{ type: "image", index: 0, src, alt: "Image" }],
      }).success,
    ).toBe(false);
  });
  it("accepts legacy requests without rich content", () => {
    expect(
      zNewHighlightSchema.safeParse({
        bookmarkId: "bookmark",
        startOffset: 0,
        endOffset: 2,
        text: "hi",
        note: null,
      }).success,
    ).toBe(true);
  });
});
