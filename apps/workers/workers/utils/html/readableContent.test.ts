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

    // Content appearing between </head> and <body> keeps original order.
    const preBodyHtml = `<html><head><title>Order</title></head><p>FIRST_PARAGRAPH ${paragraph}</p><body><p>SECOND_PARAGRAPH ${paragraph}</p></body></html>`;
    const preBodyResult = extractReadableContent(
      preBodyHtml,
      "https://example.com/posts/order",
    );
    const orderedContent = preBodyResult.readableContent?.content ?? "";
    expect(orderedContent.indexOf("FIRST_PARAGRAPH")).toBeGreaterThanOrEqual(0);
    expect(orderedContent.indexOf("SECOND_PARAGRAPH")).toBeGreaterThan(
      orderedContent.indexOf("FIRST_PARAGRAPH"),
    );
  });

  test("unwraps hidden modal wrappers on Facebook and Threads without dropping non-login dialogs", () => {
    const fbHtml = `
      <html>
        <body>
          <div id="scrollview" aria-hidden="true">
            <div role="dialog" aria-modal="true">
              <div role="article">
                <p>POST_BODY ${paragraph}</p>
                <p>${paragraph}</p>
              </div>
            </div>
          </div>
          <div role="dialog" aria-modal="true">
            <form action="/login">
              <input type="text" name="email" />
              <input type="password" name="pass" />
              <button>Log in</button>
            </form>
          </div>
        </body>
      </html>
    `;
    const fbResult = extractReadableContent(
      fbHtml,
      "https://www.facebook.com/example/posts/123",
    );
    expect(fbResult.readableContent?.content).toContain("POST_BODY");
    expect(fbResult.readableContent?.content).not.toContain("Log in");

    // A non-login dialog whose text contains "log in" as a substring (e.g.
    // "Catalog information") must not be deleted as a login overlay.
    const fbCatalogHtml = `
      <html>
        <body>
          <div role="dialog">
            <p>Catalog information: ${paragraph} ${paragraph}</p>
          </div>
        </body>
      </html>
    `;
    const fbCatalogResult = extractReadableContent(
      fbCatalogHtml,
      "https://www.facebook.com/photo/?fbid=123",
    );
    expect(fbCatalogResult.readableContent?.content).toContain(
      "Catalog information",
    );

    const threadsHtml = `
      <html>
        <body>
          <div id="scrollview" aria-hidden="true">
            <article>
              <p>THREADS_POST ${paragraph}</p>
              <p>${paragraph}</p>
            </article>
          </div>
        </body>
      </html>
    `;
    const threadsResult = extractReadableContent(
      threadsHtml,
      "https://www.threads.com/@user/post/123",
    );
    expect(threadsResult.readableContent?.content).toContain("THREADS_POST");
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
