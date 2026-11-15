import { describe, expect, it } from "vitest";

import type { ZBookmark } from "../types/bookmarks";
import { BookmarkTypes } from "../types/bookmarks";
import { getBookmarkDisplayTitle, getTextDisplayTitle } from "./bookmarkUtils";

describe("getTextDisplayTitle", () => {
  it("uses the first non-empty line", () => {
    expect(getTextDisplayTitle("\n\n  \nFirst line\nSecond line")).toBe(
      "First line",
    );
  });

  it.each([
    ["# Heading", "Heading"],
    ["### Sub heading", "Sub heading"],
    ["> quoted", "quoted"],
    ["- item", "item"],
    ["* item", "item"],
    ["1. item", "item"],
    ["- [ ] todo", "todo"],
    ["- [x] done", "done"],
    ["**bold** and *italic*", "bold and italic"],
    ["__bold__ and _italic_", "bold and italic"],
    ["some `code` here", "some code here"],
    ["~~gone~~ kept", "gone kept"],
    ["[a link](https://example.com) here", "a link here"],
    ["![alt text](https://example.com/a.png)", "alt text"],
  ])("strips markers from %s", (input, expected) => {
    expect(getTextDisplayTitle(input)).toBe(expected);
  });

  it("leaves underscores and asterisks inside words alone", () => {
    expect(getTextDisplayTitle("snake_case_name and 2*3*4")).toBe(
      "snake_case_name and 2*3*4",
    );
  });

  it("skips fences and horizontal rules", () => {
    expect(getTextDisplayTitle("```ts\nconst a = 1;\n```")).toBe(
      "const a = 1;",
    );
    expect(getTextDisplayTitle("---\nAfter the rule")).toBe("After the rule");
  });

  it("truncates long lines with an ellipsis", () => {
    expect(getTextDisplayTitle("a".repeat(200), 10)).toBe(`${"a".repeat(10)}…`);
  });

  it("returns null when there's no text", () => {
    expect(getTextDisplayTitle("")).toBeNull();
    expect(getTextDisplayTitle("  \n\n---\n")).toBeNull();
  });
});

describe("getBookmarkDisplayTitle", () => {
  const withContent = (content: unknown, title: string | null = null) =>
    ({ title, content }) as unknown as ZBookmark;

  it("prefers the bookmark's own title", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({ type: BookmarkTypes.TEXT, text: "First line" }, "Mine"),
      ),
    ).toBe("Mine");
  });

  it("names an untitled note after its first line", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({
          type: BookmarkTypes.TEXT,
          text: "# UX review g6qqdx\nThe rest of it",
        }),
      ),
    ).toBe("UX review g6qqdx");
  });

  it("treats a blank title as no title", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({ type: BookmarkTypes.TEXT, text: "First line" }, "   "),
      ),
    ).toBe("First line");
    expect(
      getBookmarkDisplayTitle(
        withContent(
          { type: BookmarkTypes.LINK, url: "https://example.com" },
          "   ",
        ),
      ),
    ).toBe("https://example.com");
  });

  it("is null for a note with no text in it", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({ type: BookmarkTypes.TEXT, text: "" }),
      ),
    ).toBeNull();
  });

  it("falls back on a link's own title, then its URL", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({
          type: BookmarkTypes.LINK,
          title: "Crawled title",
          url: "https://example.com",
        }),
      ),
    ).toBe("Crawled title");
    expect(
      getBookmarkDisplayTitle(
        withContent({ type: BookmarkTypes.LINK, url: "https://example.com" }),
      ),
    ).toBe("https://example.com");
  });

  it("falls back on an asset's file name", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({ type: BookmarkTypes.ASSET, fileName: "scan.pdf" }),
      ),
    ).toBe("scan.pdf");
  });
});
