import { describe, expect, it } from "vitest";

import { BookmarkTypes, ZBookmark } from "../types/bookmarks";
import { toExportFormat, toNetscapeFormat } from "./exporters";
import { parseImportFile } from "./parsers";

function linkBookmark(
  url: string,
  title = "title",
  tagNames: string[] = [],
): ZBookmark {
  return {
    id: "id1",
    createdAt: new Date(1700000000000),
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
    tags: tagNames.map((name, i) => ({
      id: `tag${i}`,
      name,
      attachedBy: "ai" as const,
    })),
    assets: [],
    content: {
      type: BookmarkTypes.LINK,
      url,
    },
  };
}

describe("toNetscapeFormat", () => {
  it("exports http and https links", () => {
    const out = toNetscapeFormat([
      linkBookmark("https://example.com/page"),
      linkBookmark("http://example.com/other"),
    ]);
    expect(out).toContain('HREF="https://example.com/page"');
    expect(out).toContain('HREF="http://example.com/other"');
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

  it("escapes HTML metacharacters in the TAGS attribute", () => {
    const out = toNetscapeFormat([
      linkBookmark("https://example.com/page", "innocent title", [
        'pwn"><script>alert(document.domain)</script><a x="',
      ]),
    ]);
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain('TAGS="pwn&quot;&gt;&lt;script&gt;');
  });
});

it("preserves custom metadata in a Karakeep JSON export/import", () => {
  const bookmark = linkBookmark("https://example.com");
  bookmark.customMetadata = {
    "github.id": 123,
    nested: { values: [true, null, "x"] },
  };
  const exported = JSON.stringify({ bookmarks: [toExportFormat(bookmark)] });
  const imported = parseImportFile("karakeep", exported);
  expect(imported.bookmarks[0].customMetadata).toEqual(bookmark.customMetadata);
});
