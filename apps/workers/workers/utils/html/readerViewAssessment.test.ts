import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import {
  applyChallengePageAssessment,
  assessReaderView,
  unavailableReaderViewAssessment,
} from "./readerViewAssessment";

function assess(sourceHtml: string, extractedHtml: string, url: string) {
  const source = new JSDOM(sourceHtml, { url });
  const extracted = new JSDOM(extractedHtml, { url });
  try {
    return assessReaderView(
      source.window.document,
      extracted.window.document,
      url,
    );
  } finally {
    source.window.close();
    extracted.window.close();
  }
}

const paragraph =
  "A useful article paragraph contains connected prose, enough detail to make a point, and several complete sentences. It gives readers context. It is not merely a navigation label.";

describe("reader view assessment", () => {
  test("accepts a structured article with substantial prose", () => {
    const html = `
      <html>
        <head><meta property="og:type" content="article"></head>
        <body><article><h1>A considered essay</h1>${Array.from(
          { length: 6 },
          () => `<p>${paragraph}</p>`,
        ).join("")}</article></body>
      </html>`;

    const result = assess(html, html, "https://example.com/essays/considered");

    expect(result.status).toBe("readable");
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.reasons).toContain("article_metadata");
  });

  test("rejects a search homepage made of controls and navigation links", () => {
    const links = [
      "About",
      "Store",
      "Mail",
      "Images",
      "Advertising",
      "Business",
      "Privacy",
      "Terms",
      "Settings",
    ]
      .map((label) => `<a href="/${label.toLowerCase()}">${label}</a>`)
      .join("");
    const source = `<main><form><input name="q"><button>Search</button><button>Lucky</button></form>${links}</main>`;

    const result = assess(
      source,
      `<div>${links}</div>`,
      "https://www.google.com/",
    );

    expect(result.status).toBe("not_readable");
    expect(result.reasons).toContain("very_high_link_density");
    expect(result.reasons).toContain("root_page");
  });

  test("rejects a link-heavy search results extraction despite its length", () => {
    const results = Array.from(
      { length: 12 },
      (_, index) =>
        `<li><a href="https://example.com/${index}">Result ${index}: ${paragraph}</a></li>`,
    ).join("");
    const source = `<main><form><input name="q"><button>Search</button><button>Tools</button></form><ul>${results}</ul></main>`;

    const result = assess(
      source,
      `<ul>${results}</ul>`,
      "https://www.google.com/search?q=reader+mode",
    );

    expect(result.status).toBe("not_readable");
    expect(result.reasons).toContain("search_url");
    expect(result.reasons).toContain("link_collection");
  });

  test("keeps short but prose-like content uncertain", () => {
    const html = `<main><p>${paragraph}</p><p>${paragraph}</p></main>`;

    const result = assess(html, html, "https://example.com/note");

    expect(result.status).toBe("uncertain");
  });

  test("does not auto-select reader view for a prose-heavy homepage", () => {
    const html = `<main>${Array.from(
      { length: 8 },
      () => `<p>${paragraph}</p>`,
    ).join(
      "",
    )}<form><input><button>Start now</button><button>Sign in</button></form></main>`;

    const result = assess(html, html, "https://example.com/");

    expect(result.status).toBe("uncertain");
    expect(result.score).toBeLessThan(70);
    expect(result.reasons).toContain("root_page");
  });

  test("accepts code-heavy documentation with a substantial preformatted block", () => {
    const code = Array.from(
      { length: 20 },
      (_, index) => `const task${index} = queue.enqueue({ id: ${index} });`,
    ).join("\n");
    const source = `<article><h1>Queue documentation</h1><p>${paragraph}</p><pre>${code}</pre></article>`;
    const extracted = `<article><p>${paragraph}</p><pre>${code}</pre></article>`;

    const result = assess(source, extracted, "https://example.com/docs/queue");

    expect(result.status).toBe("readable");
    expect(result.reasons).toContain("long_preformatted_content");
  });

  test("does not penalize a single substantive block with low link density as a link collection", () => {
    const authors = Array.from(
      { length: 8 },
      (_, i) => `<a href="/author/${i}">A. ${i}</a>`,
    ).join(", ");
    const longAbstract = `${paragraph} ${paragraph} ${paragraph} ${paragraph}`;
    const lowDensityHtml = `<article><h1>Paper Title</h1><div>${authors}</div><blockquote>${longAbstract}</blockquote></article>`;

    const lowDensityResult = assess(
      lowDensityHtml,
      lowDensityHtml,
      "https://example.com/abs/1234.5678",
    );
    expect(lowDensityResult.reasons).not.toContain("link_collection");
    expect(lowDensityResult.status).toBe("readable");

    // Above the 0.12 link-density threshold, a single substantive block with
    // >= 8 links still receives the link_collection penalty.
    const verboseLinks = Array.from(
      { length: 8 },
      (_, i) => `<a href="/ref/${i}">Reference item number ${i}</a>`,
    ).join(", ");
    const higherDensityHtml = `<article><div>${verboseLinks}</div><p>${paragraph}</p></article>`;
    const higherDensityResult = assess(
      higherDensityHtml,
      higherDensityHtml,
      "https://example.com/abs/1234.5678",
    );
    expect(higherDensityResult.reasons).toContain("link_collection");

    // With zero substantive blocks, >= 8 links still receives link_collection
    // even when total link density is low.
    const noBlockHtml = `<article><div>${authors}</div><div>${longAbstract}</div></article>`;
    const noBlockResult = assess(
      noBlockHtml,
      noBlockHtml,
      "https://example.com/abs/1234.5678",
    );
    expect(noBlockResult.reasons).toContain("link_collection");
  });

  test("caps control-heavy homepages even with og:type=article, search URLs, and blockless non-readerable pages", () => {
    const controlHeavyArticleHome = `
      <html>
        <head><meta property="og:type" content="article"></head>
        <body>
          <main>
            <form><input><button>Sign in</button><button>Join</button><button>Menu</button><button>Search</button><button>Filter</button><button>Topics</button></form>
            ${Array.from({ length: 5 }, () => `<p>${paragraph}</p>`).join("")}
          </main>
        </body>
      </html>`;
    const homeResult = assess(
      controlHeavyArticleHome,
      controlHeavyArticleHome,
      "https://example.com/",
    );
    expect(homeResult.reasons).toContain("root_page");
    expect(homeResult.status).toBe("uncertain");
    expect(homeResult.score).toBeLessThanOrEqual(60);

    const searchHtml = `<article>${Array.from({ length: 6 }, () => `<p>${paragraph}</p>`).join("")}</article>`;
    const searchResult = assess(
      searchHtml,
      searchHtml,
      "https://example.com/?q=bookmarks",
    );
    expect(searchResult.reasons).toContain("search_url");
    expect(searchResult.status).not.toBe("readable");
    expect(searchResult.score).toBeLessThanOrEqual(50);

    const blocklessCards = `<article>${Array.from({ length: 12 }, (_, i) => `<div>Short headline card ${i}. Another brief note.</div>`).join("")}</article>`;
    const blocklessResult = assess(
      blocklessCards,
      blocklessCards,
      "https://example.com/news",
    );
    expect(blocklessResult.reasons).toContain("no_substantive_blocks");
    expect(blocklessResult.status).not.toBe("readable");
    expect(blocklessResult.score).toBeLessThanOrEqual(60);
  });

  test("downgrades challenge pages via applyChallengePageAssessment", () => {
    const readable = {
      status: "readable" as const,
      score: 90,
      reasons: ["useful_content_length" as const],
      classifierVersion: 6,
    };
    expect(applyChallengePageAssessment(readable, false)).toBe(readable);
    expect(applyChallengePageAssessment(readable, true)).toEqual({
      status: "not_readable",
      score: 0,
      reasons: ["useful_content_length", "challenge_page"],
      classifierVersion: 6,
    });
    expect(
      applyChallengePageAssessment(unavailableReaderViewAssessment(), true),
    ).toEqual({
      status: "unavailable",
      score: 0,
      reasons: ["no_extracted_content", "challenge_page"],
      classifierVersion: 6,
    });
    expect(applyChallengePageAssessment(null, true)).toBeNull();
  });

  test("represents a missing extraction separately", () => {
    expect(unavailableReaderViewAssessment()).toEqual({
      status: "unavailable",
      score: 0,
      reasons: ["no_extracted_content"],
      classifierVersion: 6,
    });
  });
});
