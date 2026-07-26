import { describe, expect, it } from "vitest";

import { BookmarkTypes, ZBookmark } from "../types/bookmarks";
import { toExportFormat, toNetscapeFormat } from "./exporters";

function linkBookmark(url: string, title = "title"): ZBookmark {
  return {
    id: "id1",
    createdAt: new Date(1700000000000),
    lastSavedAt: new Date(1800000000000),
    modifiedAt: null,
    title,
    archived: false,
    favourited: false,
    taggingStatus: "success",
    summarizationStatus: null,
    embeddingStatus: null,
    note: null,
    summary: null,
    source: "api",
    userId: "user1",
    tags: [],
    assets: [],
    content: {
      type: BookmarkTypes.LINK,
      url,
    },
  };
}

describe("toExportFormat", () => {
  it("preserves the original creation timestamp after a bookmark is re-saved", () => {
    const bookmark = linkBookmark("https://example.com/page");

    expect(toExportFormat(bookmark).createdAt).toBe(
      Math.floor(bookmark.createdAt.getTime() / 1000),
    );
  });
});

describe("toNetscapeFormat", () => {
  it("exports http and https links", () => {
    const out = toNetscapeFormat([
      linkBookmark("https://example.com/page"),
      linkBookmark("http://example.com/other"),
    ]);
    expect(out).toContain('HREF="https://example.com/page"');
    expect(out).toContain('HREF="http://example.com/other"');
  });

  it("preserves the original creation timestamp after a bookmark is re-saved", () => {
    const bookmark = linkBookmark("https://example.com/page");
    const out = toNetscapeFormat([bookmark]);

    expect(out).toContain(
      `ADD_DATE="${Math.floor(bookmark.createdAt.getTime() / 1000)}"`,
    );
  });

  it("drops links with unsafe schemes", () => {
    const out = toNetscapeFormat([
      linkBookmark("javascript:alert(document.cookie)"),
      linkBookmark("data:text/html,<script>alert(1)</script>"),
      linkBookmark("vbscript:MsgBox(1)"),
      linkBookmark("https://example.com/safe"),
    ]);
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("data:");
    expect(out).not.toContain("vbscript:");
    expect(out).toContain('HREF="https://example.com/safe"');
  });

  it("escapes HTML metacharacters in the URL attribute", () => {
    const out = toNetscapeFormat([
      linkBookmark("https://example.com/?a=1&b=2"),
    ]);
    expect(out).toContain('HREF="https://example.com/?a=1&amp;b=2"');
  });
});
