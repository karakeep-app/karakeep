import { describe, expect, test } from "vitest";

import {
  isAmazonHost,
  isRedditHost,
  isValidMetadataValue,
  isXHost,
  isYoutubeHost,
  normalizeMetadata,
} from "./htmlMetadata";

describe("htmlMetadata", () => {
  test("matches domain plugin hosts without matching path substrings", () => {
    expect(isAmazonHost("https://www.amazon.co.jp/dp/B0123")).toBe(true);
    expect(isAmazonHost("https://amzn.to/abc")).toBe(true);
    expect(isAmazonHost("https://www.a.co/d/abc")).toBe(true);
    expect(isAmazonHost("https://example.com/amazon")).toBe(false);

    expect(isYoutubeHost("https://youtu.be/123")).toBe(true);
    expect(isYoutubeHost("https://notyoutube.com/watch")).toBe(false);

    expect(isRedditHost("https://old.reddit.com/r/ts/")).toBe(true);
    expect(isRedditHost("https://example.com/reddit")).toBe(false);

    expect(isXHost("https://twitter.com/user/status/1")).toBe(true);
    expect(isXHost("https://example.com/x")).toBe(false);
  });

  test("rejects numeric author IDs, placeholder/ico images, and invisible-only text", () => {
    expect(isValidMetadataValue("123456789012", { propName: "author" })).toBe(
      false,
    );
    expect(isValidMetadataValue("alice", { propName: "author" })).toBe(true);

    expect(
      isValidMetadataValue("https://example.com/assets/1x1.gif", {
        propName: "image",
      }),
    ).toBe(false);
    expect(
      isValidMetadataValue("https://example.com/favicon.ico", {
        propName: "image",
      }),
    ).toBe(false);
    expect(
      isValidMetadataValue("https://example.com/hero-1200x630.jpg", {
        propName: "image",
      }),
    ).toBe(true);

    expect(isValidMetadataValue("\u200e", { propName: "description" })).toBe(
      false,
    );
    expect(isValidMetadataValue(" \u200e ", { propName: "description" })).toBe(
      false,
    );
    expect(
      isValidMetadataValue("\u200eExample App", { propName: "title" }),
    ).toBe(true);
  });

  test("strips leading/trailing invisible format chars and trailing 'logo' on publisher", () => {
    expect(
      normalizeMetadata({
        title: "\u200eExample App - Store",
        description: "\u200e",
        author: "\ufeffJane Doe\u200f",
        publisher: "Acme Docs logo",
        image: "https://example.com/img.png",
      }),
    ).toEqual({
      title: "Example App - Store",
      description: null,
      author: "Jane Doe",
      publisher: "Acme Docs",
      image: "https://example.com/img.png",
    });
  });
});
