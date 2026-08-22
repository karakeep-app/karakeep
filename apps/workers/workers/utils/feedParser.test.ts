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
      // 2026-01-14 10:00:00 -0500 == 2026-01-14 15:00:00 UTC
      publishedAt: new Date("2026-01-14T15:00:00.000Z"),
    });
  });

  test("extracts the published date from Atom feeds (e.g. Reddit)", async () => {
    const items = await parseFeedItems(`
      <?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>reddit</title>
        <entry>
          <author><name>/u/username</name></author>
          <id>post_id</id>
          <link href="https://example.org/permalink"/>
          <updated>2025-12-31T12:28:39+00:00</updated>
          <published>2025-12-31T12:28:39+00:00</published>
          <title>Post title</title>
        </entry>
      </feed>
    `);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      guid: "post_id",
      link: "https://example.org/permalink",
      title: "Post title",
      publishedAt: new Date("2025-12-31T12:28:39.000Z"),
    });
  });

  test("leaves publishedAt undefined when the feed provides no date", async () => {
    const items = await parseFeedItems(`
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Test Feed</title>
          <link>https://example.com</link>
          <description>Test</description>
          <item>
            <guid isPermaLink="false">no-date</guid>
            <link>https://example.com/no-date</link>
            <title>No date</title>
          </item>
        </channel>
      </rss>
    `);

    expect(items).toHaveLength(1);
    expect(items[0].publishedAt).toBeUndefined();
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
