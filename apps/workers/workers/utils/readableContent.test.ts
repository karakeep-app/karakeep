import { afterEach, describe, expect, test, vi } from "vitest";

import { extractReadableContent } from "./readableContent";

const paragraph =
  "A useful article paragraph contains connected prose, enough detail to make a point, and several complete sentences. It gives readers context. It is not merely a navigation label.";

function page(body: string, title = "Test page") {
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

describe("extractReadableContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("extracts the article and drops the surrounding navigation", () => {
    const html = page(`
      <nav><a href="/">Home</a><a href="/about">About us</a><a href="/subscribe">Subscribe now</a></nav>
      <article>
        <h1>Test page</h1>
        <p>${paragraph}</p>
        <p>Second paragraph. ${paragraph}</p>
        <p>Third paragraph. ${paragraph}</p>
      </article>
      <footer>Copyright footer text</footer>
    `);

    const { readableContent, readerViewAssessment } = extractReadableContent(
      html,
      "https://example.com/article",
    );

    expect(readableContent?.content).toContain("Second paragraph.");
    expect(readableContent?.content).toContain("Third paragraph.");
    expect(readableContent?.content).not.toContain("Subscribe now");
    expect(readerViewAssessment.status).not.toBe("unavailable");
  });

  test("falls back to Readability when Defuddle extracts nothing", () => {
    // Defuddle strips trailing headings, so a page that is only a heading
    // comes back empty from it.
    const html = page("<h1>Hello World</h1>", "My test title");

    const { readableContent } = extractReadableContent(
      html,
      "https://example.com/hello.html",
    );

    expect(readableContent?.content).toContain("Hello World");
  });

  test("reports unavailable when no extractor finds any content", () => {
    const { readableContent, readerViewAssessment } = extractReadableContent(
      page(""),
      "https://example.com/empty",
    );

    expect(readableContent).toBeNull();
    expect(readerViewAssessment.status).toBe("unavailable");
  });

  test("uses lazy-load image attributes as the image src", () => {
    const html = page(`
      <article>
        <p>${paragraph}</p>
        <img data-src="https://example.com/real.jpg" width="800" height="600" alt="A photo">
        <p>Second paragraph. ${paragraph}</p>
      </article>
    `);

    const { readableContent } = extractReadableContent(
      html,
      "https://example.com/article",
    );

    expect(readableContent?.content).toContain(
      'src="https://example.com/real.jpg"',
    );
  });

  test.each([
    "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    "https://x.com/jack/status/20",
    "https://www.reddit.com/r/test/comments/abc123/a_post/",
  ])("doesn't make network requests for %s", (url) => {
    const fetchSpy = vi.fn(() => {
      throw new Error("unexpected network request");
    });
    vi.stubGlobal("fetch", fetchSpy);

    extractReadableContent(page(`<main><p>${paragraph}</p></main>`), url);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
