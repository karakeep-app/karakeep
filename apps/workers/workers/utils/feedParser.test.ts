import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { parseFeedItems } from "./feedParser";

describe("parseFeedItems", () => {
  test("parses TWZ-style RSS items without dropping them", async () => {
    const xmlData = await readFile(
      new URL("./__fixtures__/twz-feed.xml", import.meta.url),
      "utf8",
    );

    const items = await parseFeedItems(xmlData);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      guid: "https://www.twz.com/?p=12345",
      link: "https://www.twz.com/sea/test-article",
      title: "Test TWZ article",
      categories: ["Sea", "News & Features"],
    });
  });

  test("falls back to guid when feeds do not provide an item id", async () => {
    const items = await parseFeedItems(`
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Test Feed</title>
          <link>https://example.com</link>
          <description>Test</description>
          <item>
            <guid isPermaLink="false">guid-1</guid>
            <link>https://example.com/post-1</link>
            <title>Post 1</title>
          </item>
        </channel>
      </rss>
    `);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      guid: "guid-1",
      link: "https://example.com/post-1",
      title: "Post 1",
    });
    expect(items[0].id).toBeUndefined();
  });
});
