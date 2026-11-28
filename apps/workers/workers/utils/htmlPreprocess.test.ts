import { describe, expect, test } from "vitest";

import {
  preprocessHtmlForMetadata,
  stripNonContentMarkupForDom,
} from "./htmlPreprocess";

describe("stripNonContentMarkupForDom", () => {
  test("preserves content when a script string contains <style> and escaped <\\/style>", () => {
    const html = `<html><head><script>var s="<style>"+css+"<\\/style>";</script><meta property="og:title" content="Keep Me"></head><body><article><p>Important article body.</p></article><div><style>.x{color:red}</style></div></body></html>`;

    const metaHtml = preprocessHtmlForMetadata(html).htmlContent;
    expect(metaHtml).toContain('<meta property="og:title" content="Keep Me">');
    expect(metaHtml).toContain("Important article body.");
    expect(metaHtml).not.toContain(".x{color:red}");

    const domHtml = stripNonContentMarkupForDom(html);
    expect(domHtml).toContain('<meta property="og:title" content="Keep Me">');
    expect(domHtml).toContain("Important article body.");
    expect(domHtml).not.toContain(".x{color:red}");
    expect(domHtml).not.toContain("var s=");
  });

  test("ignores <style> and <script> text inside HTML comments, textarea, title, and quoted attributes", () => {
    const html = [
      "<html><head>",
      "<title>How &lt;style&gt; and <script> tags work</title>",
      "<!-- <style>unclosed comment style <script>unclosed -->",
      "</head><body>",
      '<div data-example="<style>" data-label="a > b"><p>Visible text</p></div>',
      "<textarea><style>.in-textarea{}</style><script>inTextarea()</script></textarea>",
      '<script data-expr="a > b">dropMe()</script>',
      "<style>/* İ */.drop{}</style>",
      "<article>Keep after Unicode</article>",
      "</body></html>",
    ].join("");

    const stripped = stripNonContentMarkupForDom(html);
    expect(stripped).toContain(
      "<title>How &lt;style&gt; and <script> tags work</title>",
    );
    expect(stripped).toContain(
      '<div data-example="<style>" data-label="a > b"><p>Visible text</p></div>',
    );
    expect(stripped).toContain(
      "<textarea><style>.in-textarea{}</style><script>inTextarea()</script></textarea>",
    );
    expect(stripped).toContain("<article>Keep after Unicode</article>");
    expect(stripped).not.toContain("dropMe()");
    expect(stripped).not.toContain(".drop{}");
  });

  test("keeps all JSON-LD, JSON data, math, and site-extractor scripts while stripping executable scripts", () => {
    const html = `
      <html>
        <head>
          <style>body { color: red; }</style>
          <script src="https://cdn.example.com/app.js"></script>
          <script data-type="application/ld+json">window.__FAKE__ = 1;</script>
          <script>window.__BIG_BUNDLE__ = 1;</script>
          <script type="application/ld+json">{"@type":"Article"}</script>
          <script type="application/json">{"replies":["hello"]}</script>
          <script type="math/tex">E = mc^2</script>
          <script id="initial-state">{"mastodon":true}</script>
          <script id="preloads-json">{"substack":true}</script>
        </head>
        <body>
          <p>Article text</p>
          <script>$RC("B:0","S:0")</script>
          <script>var ytInitialData = {"chapters":[]};</script>
          <script>var ytInitialPlayerResponse = {"videoDetails":{}};</script>
          <script>window.__preloadedData = {"nyt":true};</script>
          <script>window._preloads = JSON.parse("{}");</script>
        </body>
      </html>
    `;

    const stripped = stripNonContentMarkupForDom(html);
    expect(stripped).not.toContain("color: red");
    expect(stripped).not.toContain("cdn.example.com/app.js");
    expect(stripped).not.toContain("__FAKE__");
    expect(stripped).not.toContain("__BIG_BUNDLE__");
    expect(stripped).toContain('"@type":"Article"');
    expect(stripped).toContain('{"replies":["hello"]}');
    expect(stripped).toContain("E = mc^2");
    expect(stripped).toContain('{"mastodon":true}');
    expect(stripped).toContain('{"substack":true}');
    expect(stripped).toContain('$RC("B:0","S:0")');
    expect(stripped).toContain("ytInitialData");
    expect(stripped).toContain("ytInitialPlayerResponse");
    expect(stripped).toContain("__preloadedData");
    expect(stripped).toContain("_preloads");
  });

  test("preserves trailing content on unclosed <style> or <script> tags", () => {
    const unclosedStyle = "<style>body{color:red}<p>Trailing content</p>";
    expect(stripNonContentMarkupForDom(unclosedStyle)).toContain(
      "<p>Trailing content</p>",
    );

    const unclosedScript = "<script>var x = 1;<p>Trailing content</p>";
    expect(stripNonContentMarkupForDom(unclosedScript)).toContain(
      "<p>Trailing content</p>",
    );
  });
});

describe("preprocessHtmlForMetadata", () => {
  test("replaces embedded audio/video data URIs and strips styles while keeping scripts", () => {
    const html = `<html><head><style>body{}</style><script>keep()</script></head><body><video src="data:video/mp4;base64,AAAA"></video></body></html>`;
    const result = preprocessHtmlForMetadata(html);
    expect(result.replacementCount).toBe(1);
    expect(result.replacedBytes).toBeGreaterThan(0);
    expect(result.htmlContent).toContain('src="about:blank"');
    expect(result.htmlContent).not.toContain("body{}");
    expect(result.htmlContent).toContain("<script>keep()</script>");
  });
});
