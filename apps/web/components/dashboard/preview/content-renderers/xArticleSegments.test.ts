import { describe, expect, test } from "vitest";

import {
  extractReplyTweetIds,
  isArticleContent,
  parseArticleSegments,
} from "./xArticleSegments";

describe("parseArticleSegments", () => {
  test("keeps nested quote-tweet embeds intact", () => {
    const html = `
      <h1>Article title</h1>
      <p>Intro paragraph.</p>
      <blockquote>
        <p>Main tweet text</p>
        <blockquote><p>Quoted tweet text</p></blockquote>
        <p><a href="https://x.com/example/status/1234567890">https://x.com/example/status/1234567890</a></p>
      </blockquote>
      <p>Closing paragraph.</p>
    `;

    expect(parseArticleSegments(html)).toEqual([
      {
        type: "html",
        content: "<h1>Article title</h1>\n      <p>Intro paragraph.</p>",
      },
      {
        type: "tweet",
        id: "1234567890",
      },
      {
        type: "html",
        content: "<p>Closing paragraph.</p>",
      },
    ]);
  });
});

describe("extractReplyTweetIds", () => {
  test("deduplicates reply tweet ids from the replies section", () => {
    const html = `
      <h1>Article title</h1>
      <h3>Replies</h3>
      <blockquote><a href="https://x.com/example/status/1">one</a></blockquote>
      <blockquote><a href="https://x.com/example/status/1">duplicate</a></blockquote>
      <blockquote><a href="https://x.com/example/status/2">two</a></blockquote>
    `;

    expect(extractReplyTweetIds(html)).toEqual(["1", "2"]);
  });
});

describe("isArticleContent", () => {
  test("only treats content starting with an h1 as an article", () => {
    expect(isArticleContent("<h1>Article title</h1><p>Body</p>")).toBe(true);
    expect(isArticleContent("\n  <h1>Article title</h1><p>Body</p>")).toBe(
      true,
    );
    expect(isArticleContent("<p>Tweet header</p><h1>Quoted heading</h1>")).toBe(
      false,
    );
  });
});
