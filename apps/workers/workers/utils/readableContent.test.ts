import { describe, expect, test } from "vitest";

import {
  extractReadableContent,
  sanitizeProvidedContent,
} from "./readableContent";

const paragraph =
  "A long enough article paragraph with complete sentences so extraction keeps it cleanly and assesses readability properly.";

describe("extractReadableContent", () => {
  test("renders MathJax math/tex scripts into MathML via defuddle/node", () => {
    const html = `
      <html>
        <head><meta property="og:type" content="article"></head>
        <body>
          <article>
            <h1>Physics Note</h1>
            <p>${paragraph}</p>
            <p>Energy equivalence: <script type="math/tex">E = mc^2</script></p>
            <p>${paragraph}</p>
            <p>${paragraph}</p>
          </article>
        </body>
      </html>
    `;

    const result = extractReadableContent(
      html,
      "https://example.com/physics-note",
    );
    expect(result.readableContent).not.toBeNull();
    expect(result.readableContent?.content).toContain("<math");
    expect(result.readableContent?.content).toContain("<mrow>");
    expect(result.readableContent?.content).toContain("<mi>E</mi>");
  });

  test("strips .aok-hidden JSON blobs on Amazon pages without touching non-Amazon pages", () => {
    const html = `
      <html>
        <head><meta property="og:type" content="article"></head>
        <body>
          <article>
            <div class="a-section aok-hidden"><p>{"desktop_buybox_group_1":[{"priceAmount":14.08}]}</p></div>
            ${Array.from({ length: 5 }, () => `<p>${paragraph}</p>`).join("")}
          </article>
        </body>
      </html>
    `;

    const amazonResult = extractReadableContent(
      html,
      "https://www.amazon.com/dp/0735211299",
    );
    expect(amazonResult.readableContent).not.toBeNull();
    expect(amazonResult.readableContent?.content).not.toContain(
      "desktop_buybox_group_1",
    );
    expect(amazonResult.readableContent?.content).toContain(
      "article paragraph",
    );

    // Control: on a non-Amazon host, .aok-hidden is not stripped by our helper.
    const nonAmazonResult = extractReadableContent(
      html,
      "https://example.com/posts/test",
    );
    expect(nonAmazonResult.readableContent?.content).toContain(
      "desktop_buybox_group_1",
    );
  });

  test("falls back to Readability with an intact document when Defuddle returns empty", () => {
    // Defuddle strips trailing headings, so a page containing only an <h1>
    // yields empty output from Defuddle and exercises the Readability fallback.
    const html = `<html><body><main><h1>Only a heading</h1></main></body></html>`;

    const result = extractReadableContent(html, "https://example.com/tiny");
    expect(result.readableContent?.content).toContain("Only a heading");
  });

  test("handles HTML fragments, empty input, and relative URLs with base href", () => {
    const emptyResult = extractReadableContent("", "https://example.com/empty");
    expect(emptyResult.readableContent).toBeNull();
    expect(emptyResult.readerViewAssessment.status).toBe("unavailable");

    const fragment = `<article><h1>Fragment</h1><p>${paragraph}</p><p>${paragraph}</p><a href="next.html">Next</a></article>`;
    const fragResult = extractReadableContent(
      fragment,
      "https://example.com/posts/first.html",
    );
    expect(fragResult.readableContent?.content).toContain(
      'href="https://example.com/posts/next.html"',
    );

    // Valid HTML5 that omits <body>, and malformed HTML with content after </body>.
    const bodyContent = `<div id="root"><h1>Omitted Body</h1>${Array.from({ length: 6 }, () => `<p>${paragraph}</p>`).join("")}</div>`;
    for (const html of [
      `<html><head><title>No Body Tag</title></head>${bodyContent}</html>`,
      `<html><head><title>After Body</title></head><body></body>${bodyContent}</html>`,
    ]) {
      const result = extractReadableContent(
        html,
        "https://example.com/posts/body-reparent",
      );
      expect(result.readableContent?.content).toContain("Omitted Body");
      expect(result.readableContent?.content).toContain("article paragraph");
      expect(result.readerViewAssessment.status).toBe("readable");
    }
  });

  test("sanitizes provided HTML and assesses reader view", () => {
    const provided = `<script>alert(1)</script>${Array.from({ length: 5 }, () => `<p>${paragraph}</p>`).join("")}`;
    const source = `<html><head><meta property="og:type" content="article"></head><body><article>${provided}</article></body></html>`;

    const result = sanitizeProvidedContent(
      provided,
      source,
      "https://example.com/posts/provided",
    );
    expect(result.readableContent.content).not.toContain("<script>");
    expect(result.readableContent.content).toContain("article paragraph");
    expect(result.readerViewAssessment.status).toBe("readable");
  });
});
