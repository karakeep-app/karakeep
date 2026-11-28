import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import {
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

  test("accepts classic br-delimited essays with no <p> tags", () => {
    const body = Array.from({ length: 10 }, () => paragraph).join("<br><br>");
    const links = Array.from(
      { length: 10 },
      (_, i) => `<a href="#n${i}">[${i}]</a>`,
    ).join(" ");
    const html = `<html><body><font>${body}<br><br>${links}</font></body></html>`;

    const result = assess(html, html, "https://example.com/essay.html");

    expect(result.status).toBe("readable");
    expect(result.reasons).toContain("multiple_substantive_blocks");
    expect(result.reasons).not.toContain("link_collection");
  });

  test("does not count link-only or link-heavy br-delimited archive lists as substantive prose blocks", () => {
    const linkList = Array.from(
      { length: 12 },
      (_, i) =>
        `01/26 <a href="/post-${i}">A long title for an archived engineering blog post number ${i} about systems and performance</a>`,
    ).join("<br><br>");
    const html = `<html><body>${linkList}</body></html>`;

    const result = assess(html, html, "https://example.com/");

    expect(result.status).toBe("not_readable");
    expect(result.reasons).toContain("no_substantive_blocks");

    // Archive/index page with elevated link density (~0.30) and ~90 chars of
    // unlinked date/summary text per row should still be treated as a link collection.
    const annotatedArchive = Array.from(
      { length: 10 },
      (_, i) =>
        `2026-01-${String(i + 1).padStart(2, "0")} — <a href="/archive/${i}">Detailed post title about systems engineering #${i}</a> — Short summary blurb describing the linked release notes, migration caveats, and benchmarks.`,
    ).join("<br><br>");
    const archiveHtml = `<html><body><div>${annotatedArchive}</div></body></html>`;
    const archiveResult = assess(
      archiveHtml,
      archiveHtml,
      "https://example.com/archive",
    );

    expect(archiveResult.status).not.toBe("readable");
    expect(archiveResult.reasons).toContain("no_substantive_blocks");
    expect(archiveResult.reasons).toContain("link_collection");
  });

  test("represents a missing extraction separately", () => {
    expect(unavailableReaderViewAssessment()).toEqual({
      status: "unavailable",
      score: 0,
      reasons: ["no_extracted_content"],
      classifierVersion: 4,
    });
  });
});
