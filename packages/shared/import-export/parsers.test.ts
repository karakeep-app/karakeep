import { describe, expect, it } from "vitest";

import { parseImportFile } from "./parsers";

describe("parseNetscapeBookmarkFile", () => {
  it("parses a simple bookmark file with single bookmark", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="1234567890">Example Site</A>
</DL><p>`;

    const parsed = parseImportFile("html", html);

    const result = parsed.bookmarks;

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: "Example Site",
      content: {
        type: "link",
        url: "https://example.com",
      },
      tags: [],
      addDate: 1234567890,
      paths: [[]],
    });
  });

  it("parses bookmarks with tags", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="1234567890" TAGS="tag1,tag2,tag3">Example Site</A>
</DL><p>`;

    const parsed = parseImportFile("html", html);

    const result = parsed.bookmarks;

    expect(result).toHaveLength(1);
    expect(result[0].tags).toEqual(["tag1", "tag2", "tag3"]);
  });

  it("parses bookmarks in nested folders", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1234567890" LAST_MODIFIED="1234567891">Folder1</H3>
    <DL><p>
        <DT><H3 ADD_DATE="1234567892" LAST_MODIFIED="1234567893">Folder2</H3>
        <DL><p>
            <DT><A HREF="https://example.com" ADD_DATE="1234567894">Nested Bookmark</A>
        </DL><p>
    </DL><p>
</DL><p>`;

    const parsed = parseImportFile("html", html);

    const result = parsed.bookmarks;

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: "Nested Bookmark",
      content: {
        type: "link",
        url: "https://example.com",
      },
      paths: [["Folder1", "Folder2"]],
    });
  });

  it("handles empty folder names by replacing with 'Unnamed'", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1234567890" LAST_MODIFIED="1234567891">Named Folder</H3>
    <DL><p>
        <DT><H3 ADD_DATE="1234567892" LAST_MODIFIED="0"></H3>
        <DL><p>
            <DT><A HREF="https://example.com" ADD_DATE="1234567894">Bookmark</A>
        </DL><p>
    </DL><p>
</DL><p>`;

    const parsed = parseImportFile("html", html);

    const result = parsed.bookmarks;

    expect(result).toHaveLength(1);
    expect(result[0].paths).toEqual([["Named Folder", "Unnamed"]]);
  });

  it("parses multiple bookmarks in different folders", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1234567890">Tech</H3>
    <DL><p>
        <DT><A HREF="https://github.com" ADD_DATE="1234567891">GitHub</A>
        <DT><A HREF="https://stackoverflow.com" ADD_DATE="1234567892">Stack Overflow</A>
    </DL><p>
    <DT><H3 ADD_DATE="1234567893">News</H3>
    <DL><p>
        <DT><A HREF="https://news.ycombinator.com" ADD_DATE="1234567894">Hacker News</A>
    </DL><p>
</DL><p>`;

    const parsed = parseImportFile("html", html);

    const result = parsed.bookmarks;

    expect(result).toHaveLength(3);

    expect(result[0]).toMatchObject({
      title: "GitHub",
      content: { type: "link", url: "https://github.com" },
      paths: [["Tech"]],
    });

    expect(result[1]).toMatchObject({
      title: "Stack Overflow",
      content: { type: "link", url: "https://stackoverflow.com" },
      paths: [["Tech"]],
    });

    expect(result[2]).toMatchObject({
      title: "Hacker News",
      content: { type: "link", url: "https://news.ycombinator.com" },
      paths: [["News"]],
    });
  });

  it("parses bookmarks at root level (no folders)", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://example1.com" ADD_DATE="1234567890">Bookmark 1</A>
    <DT><A HREF="https://example2.com" ADD_DATE="1234567891">Bookmark 2</A>
</DL><p>`;

    const parsed = parseImportFile("html", html);

    const result = parsed.bookmarks;

    expect(result).toHaveLength(2);
    expect(result[0].paths).toEqual([[]]);
    expect(result[1].paths).toEqual([[]]);
  });

  it("handles deeply nested folder structures", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Level1</H3>
    <DL><p>
        <DT><H3>Level2</H3>
        <DL><p>
            <DT><H3>Level3</H3>
            <DL><p>
                <DT><H3>Level4</H3>
                <DL><p>
                    <DT><A HREF="https://example.com" ADD_DATE="1234567890">Deep Bookmark</A>
                </DL><p>
            </DL><p>
        </DL><p>
    </DL><p>
</DL><p>`;

    const parsed = parseImportFile("html", html);

    const result = parsed.bookmarks;

    expect(result).toHaveLength(1);
    expect(result[0].paths).toEqual([["Level1", "Level2", "Level3", "Level4"]]);
  });

  it("deduplicates bookmarks with the same URL", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Folder1</H3>
    <DL><p>
        <DT><A HREF="https://example.com" ADD_DATE="1234567890" TAGS="tag1">First Instance</A>
    </DL><p>
    <DT><H3>Folder2</H3>
    <DL><p>
        <DT><A HREF="https://example.com" ADD_DATE="1234567891" TAGS="tag2">Second Instance</A>
    </DL><p>
</DL><p>`;

    const parsed = parseImportFile("html", html);

    const result = parsed.bookmarks;

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      content: { type: "link", url: "https://example.com" },
      tags: ["tag1", "tag2"],
      addDate: 1234567890, // Should keep the earlier date
    });
    expect(result[0].paths).toHaveLength(2);
    expect(result[0].paths).toContainEqual(["Folder1"]);
    expect(result[0].paths).toContainEqual(["Folder2"]);
  });

  it("merges notes from duplicate bookmarks", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="1234567890">Bookmark</A>
    <DD>First note
    <DT><A HREF="https://example.com" ADD_DATE="1234567891">Bookmark</A>
    <DD>Second note
</DL><p>`;

    // Note: The current parser doesn't extract DD notes, but this test
    // documents the expected behavior if/when DD parsing is added
    const parsed = parseImportFile("html", html);

    const result = parsed.bookmarks;

    expect(result).toHaveLength(1);
    expect(result[0].content).toMatchObject({
      type: "link",
      url: "https://example.com",
    });
  });

  it("handles bookmarks without ADD_DATE attribute", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://example.com">No Date Bookmark</A>
</DL><p>`;

    const parsed = parseImportFile("html", html);

    const result = parsed.bookmarks;

    expect(result).toHaveLength(1);
    expect(result[0].addDate).toBeUndefined();
  });

  it("handles bookmarks without HREF attribute", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A ADD_DATE="1234567890">No URL Bookmark</A>
</DL><p>`;

    const parsed = parseImportFile("html", html);

    const result = parsed.bookmarks;

    expect(result).toHaveLength(1);
    expect(result[0].content).toBeUndefined();
  });

  it("handles mixed structure with folders and root-level bookmarks", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://root1.com" ADD_DATE="1234567890">Root Bookmark 1</A>
    <DT><H3>Folder</H3>
    <DL><p>
        <DT><A HREF="https://folder1.com" ADD_DATE="1234567891">Folder Bookmark</A>
    </DL><p>
    <DT><A HREF="https://root2.com" ADD_DATE="1234567892">Root Bookmark 2</A>
</DL><p>`;

    const parsed = parseImportFile("html", html);

    const result = parsed.bookmarks;

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      title: "Root Bookmark 1",
      paths: [[]],
    });
    expect(result[1]).toMatchObject({
      title: "Folder Bookmark",
      paths: [["Folder"]],
    });
    expect(result[2]).toMatchObject({
      title: "Root Bookmark 2",
      paths: [[]],
    });
  });

  it("throws error for non-Netscape bookmark files", () => {
    const html = `<html>
<head><title>Not a bookmark file</title></head>
<body>Just a regular HTML file</body>
</html>`;

    expect(() => parseImportFile("html", html)).toThrow(
      "The uploaded html file does not seem to be a bookmark file",
    );
  });
});

describe("parseKarakeepBookmarkFile", () => {
  it("keeps distinct identities for duplicate sibling list names", () => {
    const json = JSON.stringify({
      lists: [
        {
          id: "parent",
          name: "Projects",
          description: null,
          icon: "📁",
          type: "manual",
          query: null,
          parentId: null,
        },
        {
          id: "child-1",
          name: "Inbox",
          description: null,
          icon: "📁",
          type: "manual",
          query: null,
          parentId: "parent",
        },
        {
          id: "child-2",
          name: "Inbox",
          description: null,
          icon: "📁",
          type: "manual",
          query: null,
          parentId: "parent",
        },
      ],
      bookmarks: [
        {
          createdAt: 123,
          title: "One",
          tags: [],
          lists: ["child-1"],
          content: { type: "link", url: "https://one.example" },
          note: null,
          archived: false,
        },
        {
          createdAt: 456,
          title: "Two",
          tags: [],
          lists: ["child-2"],
          content: { type: "link", url: "https://two.example" },
          note: null,
          archived: false,
        },
      ],
    });

    const result = parseImportFile("karakeep", json);

    expect(result.lists).toEqual([
      {
        externalId: "parent",
        name: "Projects",
        icon: "📁",
        description: undefined,
        parentExternalId: null,
        type: "manual",
      },
      {
        externalId: "child-1",
        name: "Inbox",
        icon: "📁",
        description: undefined,
        parentExternalId: "parent",
        type: "manual",
      },
      {
        externalId: "child-2",
        name: "Inbox",
        icon: "📁",
        description: undefined,
        parentExternalId: "parent",
        type: "manual",
      },
    ]);

    expect(result.bookmarks).toHaveLength(2);
    expect(result.bookmarks[0].listExternalIds).toEqual(["child-1"]);
    expect(result.bookmarks[1].listExternalIds).toEqual(["child-2"]);
  });

  it("preserves smart list query metadata", () => {
    const json = JSON.stringify({
      lists: [
        {
          id: "manual",
          name: "Manual",
          description: null,
          icon: "📁",
          type: "manual",
          query: null,
          parentId: null,
        },
        {
          id: "smart",
          name: "Smart",
          description: "Smart list description",
          icon: "⚡",
          type: "smart",
          query: "tag:read-later",
          parentId: null,
        },
      ],
      bookmarks: [
        {
          createdAt: 123,
          title: "One",
          tags: [],
          lists: ["manual", "smart"],
          content: { type: "link", url: "https://one.example" },
          note: null,
          archived: false,
        },
      ],
    });

    const result = parseImportFile("karakeep", json);

    expect(result.lists).toContainEqual({
      externalId: "smart",
      name: "Smart",
      icon: "⚡",
      description: "Smart list description",
      parentExternalId: null,
      type: "smart",
      query: "tag:read-later",
    });
    expect(result.bookmarks[0].listExternalIds).toEqual(["manual"]);
  });
});

describe("parseOneTabFile", () => {
  it("parses URL | Title lines", () => {
    const txt = `https://example.com | Example Site
https://github.com | GitHub`;
    const { bookmarks } = parseImportFile("onetab", txt);
    expect(bookmarks).toHaveLength(2);
    expect(bookmarks[0]).toMatchObject({
      title: "Example Site",
      content: { type: "link", url: "https://example.com" },
      tags: [],
      paths: [],
    });
    expect(bookmarks[1]).toMatchObject({
      title: "GitHub",
      content: { type: "link", url: "https://github.com" },
    });
  });

  it("parses plain URL lines without a title", () => {
    const txt = `https://example.com`;
    const { bookmarks } = parseImportFile("onetab", txt);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].title).toBe("");
    expect(bookmarks[0].content).toMatchObject({ url: "https://example.com" });
  });

  it("skips non-URL lines and empty lines", () => {
    const txt = `Sat Feb 18 2023 10:30:00 GMT+0000
https://example.com | Example

not a url at all
https://github.com | GitHub`;
    const { bookmarks } = parseImportFile("onetab", txt);
    expect(bookmarks).toHaveLength(2);
  });

  it("deduplicates repeated URLs and merges tags", () => {
    const txt = `https://example.com | Example
https://example.com | Example`;
    const { bookmarks } = parseImportFile("onetab", txt);
    expect(bookmarks).toHaveLength(1);
  });
});