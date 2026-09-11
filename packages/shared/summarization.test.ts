import { describe, expect, test } from "vitest";

import { buildSummarizationInput } from "./summarization";
import { BookmarkTypes } from "./types/bookmarks";

type SummarizationInput = Parameters<typeof buildSummarizationInput>[0];
type LinkFields = NonNullable<SummarizationInput["link"]>;

const emptyLink: LinkFields = {
  title: null,
  description: null,
  publisher: null,
  author: null,
  url: "https://example.com",
};

function linkBookmark(link: Partial<LinkFields> = {}): SummarizationInput {
  return {
    type: BookmarkTypes.LINK,
    link: { ...emptyLink, ...link },
    text: null,
    asset: null,
  };
}

function textBookmark(text: string | null): SummarizationInput {
  return {
    type: BookmarkTypes.TEXT,
    link: null,
    text: text === null ? null : { text },
    asset: null,
  };
}

function assetBookmark(
  content: string | null,
  fileName: string | null = null,
): SummarizationInput {
  return {
    type: BookmarkTypes.ASSET,
    link: null,
    text: null,
    asset: { content, fileName },
  };
}

describe("buildSummarizationInput", () => {
  describe("link bookmarks", () => {
    test("includes all of the link metadata", () => {
      const input = buildSummarizationInput(
        linkBookmark({
          title: "A title",
          description: "A description",
          publisher: "A publisher",
          author: "An author",
          url: "https://example.com/article",
        }),
        "The crawled content",
      );

      expect(input).toContain("Title: A title");
      expect(input).toContain("Description: A description");
      expect(input).toContain("Content: The crawled content");
      expect(input).toContain("Publisher: A publisher");
      expect(input).toContain("Author: An author");
      expect(input).toContain("URL: https://example.com/article");
    });

    test("is built from the description alone when there is no content", () => {
      expect(
        buildSummarizationInput(
          linkBookmark({ description: "A description" }),
          "",
        ),
      ).toContain("Description: A description");
    });

    test("is built from the content alone when there is no description", () => {
      expect(
        buildSummarizationInput(linkBookmark(), "The crawled content"),
      ).toContain("Content: The crawled content");
    });

    test("returns null when there is neither description nor content", () => {
      expect(buildSummarizationInput(linkBookmark(), "")).toBeNull();
    });

    test("returns null when the link row is missing", () => {
      expect(
        buildSummarizationInput(
          { type: BookmarkTypes.LINK, link: null, text: null, asset: null },
          "The crawled content",
        ),
      ).toBeNull();
    });
  });

  describe("text bookmarks", () => {
    test("is built from the note's text", () => {
      expect(buildSummarizationInput(textBookmark("A note"), "")).toContain(
        "Content: A note",
      );
    });

    test("ignores the link content resolved for other bookmark types", () => {
      expect(
        buildSummarizationInput(textBookmark("A note"), "Unrelated content"),
      ).not.toContain("Unrelated content");
    });

    test("returns null for an empty note", () => {
      expect(buildSummarizationInput(textBookmark(""), "")).toBeNull();
    });

    test("returns null for a whitespace-only note", () => {
      expect(buildSummarizationInput(textBookmark("   \n\t "), "")).toBeNull();
    });

    test("returns null when the text row is missing", () => {
      expect(buildSummarizationInput(textBookmark(null), "")).toBeNull();
    });
  });

  describe("asset bookmarks", () => {
    test("is built from the extracted content", () => {
      const input = buildSummarizationInput(
        assetBookmark("The extracted pdf text", "paper.pdf"),
        "",
      );

      expect(input).toContain("Title: paper.pdf");
      expect(input).toContain("Content: The extracted pdf text");
    });

    test("is built without a file name", () => {
      expect(
        buildSummarizationInput(assetBookmark("The extracted pdf text"), ""),
      ).toContain("Content: The extracted pdf text");
    });

    test("returns null when no text could be extracted", () => {
      expect(buildSummarizationInput(assetBookmark(null), "")).toBeNull();
    });

    test("returns null when the extracted text is blank", () => {
      expect(buildSummarizationInput(assetBookmark("  "), "")).toBeNull();
    });
  });

  test("returns null for an unknown bookmark type", () => {
    expect(
      buildSummarizationInput(
        {
          type: BookmarkTypes.UNKNOWN,
          link: null,
          text: null,
          asset: null,
        },
        "The crawled content",
      ),
    ).toBeNull();
  });
});
