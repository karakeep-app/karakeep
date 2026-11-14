import { describe, expect, it } from "vitest";

import {
  BookmarkTypes,
  ZPublicBookmark,
} from "@karakeep/shared/types/bookmarks";

import { toRSS } from "./rss";

const params = {
  title: "Test feed",
  feedUrl: "http://localhost/api/v1/rss/lists/list1",
  siteUrl: "http://localhost/dashboard/lists/list1",
};

function bookmark(
  id: string,
  content: ZPublicBookmark["content"],
  overrides: Partial<ZPublicBookmark> = {},
): ZPublicBookmark {
  return {
    id,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    modifiedAt: null,
    title: null,
    tags: [],
    description: null,
    bannerImageUrl: null,
    content,
    ...overrides,
  };
}

describe("toRSS", () => {
  it("includes text bookmarks, deriving the title from the first line", () => {
    const xml = toRSS(params, [
      bookmark("text1", {
        type: BookmarkTypes.TEXT,
        text: "First line\nSecond line",
      }),
    ]);

    expect(xml).toContain('<guid isPermaLink="false">text1</guid>');
    expect(xml).toContain("<title><![CDATA[First line]]></title>");
    expect(xml).toContain("<description><![CDATA[First line\nSecond line]]>");
  });

  it("prefers the bookmark title and description for text bookmarks", () => {
    const xml = toRSS(params, [
      bookmark(
        "text1",
        { type: BookmarkTypes.TEXT, text: "Body" },
        { title: "My note", description: "A summary" },
      ),
    ]);

    expect(xml).toContain("<title><![CDATA[My note]]></title>");
    expect(xml).toContain("<description><![CDATA[A summary]]>");
    expect(xml).not.toContain("Body");
  });

  it("still drops links with unsafe schemes", () => {
    const xml = toRSS(params, [
      bookmark("bad", {
        type: BookmarkTypes.LINK,
        url: "javascript:alert(1)",
      }),
    ]);

    expect(xml).not.toContain("<item>");
  });
});
