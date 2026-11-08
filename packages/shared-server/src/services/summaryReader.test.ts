import { describe, expect, it } from "vitest";

import { summaryReaderHtml } from "./summaryReader";

describe("safe reader summaries", () => {
  it("renders headings and lists and labels AI content with an original link", () => {
    const html = summaryReaderHtml(
      "# Главное\n\n- Один\n- Два\n\n**Вывод**",
      "https://example.com/article?a=1&b=2",
    );
    expect(html).toContain("<h1>Главное</h1>");
    expect(html).toContain("<li>Один</li>");
    expect(html).toContain("ИИ-саммари");
    expect(html).toContain('href="https://example.com/article?a=1&amp;b=2"');
  });
  it("removes scripts, event handlers, embedded frames and tracking images", () => {
    const html = summaryReaderHtml(
      '<script>alert(1)</script><p onclick="bad()">Safe</p><iframe src="https://evil.test"></iframe><img src="https://track.test" onerror="bad()"><svg onload="bad()"></svg>',
      "https://example.com",
    );
    expect(html).toContain("<p>Safe</p>");
    for (const bad of [
      "script",
      "onclick",
      "onerror",
      "onload",
      "iframe",
      "<img",
      "<svg",
      "alert(1)",
    ])
      expect(html).not.toContain(bad);
  });
  it("rejects dangerous and protocol-relative URLs", () => {
    const html = summaryReaderHtml(
      '[bad](javascript:alert%281%29)\n\n<a href="data:text/html,bad">data</a> <a href="//evil.test">relative</a>',
      "javascript:alert(1)",
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:");
    expect(html).not.toContain('href="//');
  });
  it("escapes an original URL before inserting it into an attribute", () => {
    const html = summaryReaderHtml(
      "Text",
      'https://example.com/"><script>bad()</script>',
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("Открыть оригинал");
  });
});
