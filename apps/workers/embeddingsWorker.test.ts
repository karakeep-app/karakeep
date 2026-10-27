import { describe, expect, test, vi } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

vi.mock("metrics", () => ({
  workerStatsCounter: {
    labels: () => ({ inc: vi.fn() }),
  },
}));

vi.mock("workerTracing", () => ({
  withWorkerEventLog: () => (fn: unknown) => fn,
  withWorkerTracing: () => (fn: unknown) => fn,
}));

import type { EmbeddableBookmark } from "./workers/embeddingsWorker";
import {
  buildEmbeddingTexts,
  buildSimilarEmbeddingText,
} from "./workers/embeddingsWorker";

function embeddableBookmark(
  overrides: Partial<EmbeddableBookmark>,
): EmbeddableBookmark {
  return {
    id: "bookmark-1",
    userId: "user-1",
    title: null,
    summary: null,
    link: null,
    text: null,
    asset: null,
    ...overrides,
  } as unknown as EmbeddableBookmark;
}

describe("buildSimilarEmbeddingText", () => {
  test("uses Title + Summary once a summary exists", async () => {
    const text = await buildSimilarEmbeddingText(
      embeddableBookmark({
        title: "Async Rust",
        summary: "  Futures, pinning\n\nand executors explained.  ",
        text: { text: "raw content should be ignored" } as never,
      }),
    );

    expect(text).toBe(
      "Title: Async Rust\n\nSummary: Futures, pinning and executors explained.",
    );
  });

  test("uses only the summary when the title is missing", async () => {
    const text = await buildSimilarEmbeddingText(
      embeddableBookmark({
        summary: "A short summary.",
      }),
    );

    expect(text).toBe("Summary: A short summary.");
  });

  test("uses the crawled page title when no user title is set", async () => {
    const text = await buildSimilarEmbeddingText(
      embeddableBookmark({
        summary: "Summary text.",
        link: { title: "Crawled Page Title" } as never,
      }),
    );

    expect(text).toBe("Title: Crawled Page Title\n\nSummary: Summary text.");
  });

  test("falls back to the crawled content for links without a summary", async () => {
    const text = await buildSimilarEmbeddingText(
      embeddableBookmark({
        title: "Link",
        link: {
          contentAssetId: null,
          htmlContent: "<p>Hello world</p>",
        } as never,
      }),
    );

    expect(text).toBe("Title: Link\n\nContent excerpt: Hello world");
  });

  test("falls back to Title + Content excerpt without a summary", async () => {
    const text = await buildSimilarEmbeddingText(
      embeddableBookmark({
        title: "My note",
        text: { text: "  Some\n\nnote   content " } as never,
      }),
    );

    expect(text).toBe("Title: My note\n\nContent excerpt: Some note content");
  });

  test("returns null when there is nothing to embed", async () => {
    const text = await buildSimilarEmbeddingText(embeddableBookmark({}));

    expect(text).toBeNull();
  });
});

describe("buildEmbeddingTexts", () => {
  test("the search profile is richer than the similar-articles text", async () => {
    const texts = await buildEmbeddingTexts(
      embeddableBookmark({
        type: BookmarkTypes.LINK,
        title: "Async Rust",
        summary: "Futures explained.",
        link: {
          contentAssetId: null,
          htmlContent: "<p>Some article body</p>",
          url: "https://example.com/rust?page=1",
          author: "Jane Doe",
        } as never,
        tagsOnBookmarks: [
          { tag: { name: "rust" } },
          { tag: { name: "async" } },
        ] as never,
      }),
    );

    // Lean similar-articles text: only title + summary.
    expect(texts.similar).toBe(
      "Title: Async Rust\n\nSummary: Futures explained.",
    );
    // Rich search profile: tags, domain, description, author, content.
    expect(texts.search).toContain("Type: link");
    expect(texts.search).toContain("Tags: async, rust");
    expect(texts.search).toContain("Domain: example.com");
    expect(texts.search).toContain("Author: Jane Doe");
    expect(texts.search).toContain("Content excerpt: Some article body");
    // The URL is stripped of query params and not part of the lean text.
    expect(texts.search).toContain("https://example.com/rust");
    expect(texts.similar).not.toContain("example.com");
  });
});
