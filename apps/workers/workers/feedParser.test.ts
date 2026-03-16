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
});
