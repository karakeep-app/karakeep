import { describe, expect, it } from "vitest";

import {
  chunkReadableContent,
  decodeReadableContentCursor,
} from "./readableContent";

describe("readable content chunking", () => {
  it("ends a chunk at a nearby paragraph boundary", () => {
    const firstParagraph = "a".repeat(80);
    const secondParagraph = "b".repeat(80);
    const page = chunkReadableContent({
      bookmarkId: "bookmark_1",
      content: `${firstParagraph}\n\n${secondParagraph}`,
      contentVersion: "sha256:version",
      format: "markdown",
      maxChars: 100,
    });

    expect(page).not.toBeNull();
    expect(page!.content).toBe(`${firstParagraph}\n\n`);
    expect(page!.range).toEqual({ start: 0, end: 82, total: 162 });
    expect(page!.truncated).toBe(true);

    const cursor = decodeReadableContentCursor(page!.nextCursor!);
    expect(cursor).toEqual({
      version: 1,
      bookmarkId: "bookmark_1",
      format: "markdown",
      contentVersion: "sha256:version",
      offset: 82,
    });
  });

  it("uses Unicode character offsets without splitting surrogate pairs", () => {
    const page = chunkReadableContent({
      bookmarkId: "bookmark_1",
      content: "😀😀😀",
      contentVersion: "sha256:version",
      format: "text",
      maxChars: 2,
    });

    expect(page?.content).toBe("😀😀");
    expect(page?.range).toEqual({ start: 0, end: 2, total: 3 });
  });

  it("rejects malformed cursors and offsets beyond the content", () => {
    expect(decodeReadableContentCursor("not-a-cursor")).toBeNull();
    expect(
      chunkReadableContent({
        bookmarkId: "bookmark_1",
        content: "short",
        contentVersion: "sha256:version",
        format: "text",
        maxChars: 10,
        start: 6,
      }),
    ).toBeNull();
  });
});
