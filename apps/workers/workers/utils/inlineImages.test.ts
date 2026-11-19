import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { stashInlineImages } from "./inlineImages";

function base64Image(length: number, type = "png") {
  return `data:image/${type};base64,${"A".repeat(length)}`;
}

function sanitize(html: string) {
  const window = new JSDOM("").window;
  try {
    return DOMPurify(window).sanitize(html);
  } finally {
    window.close();
  }
}

describe("stashInlineImages", () => {
  it("replaces large inline images and restores them in the output", () => {
    const large = base64Image(50_000);
    const html = `<article><p>Text</p><img src="${large}" alt="a"></article>`;

    const stash = stashInlineImages(html, 1024);

    expect(stash.count).toBe(1);
    expect(stash.bytes).toBe(large.length);
    expect(stash.htmlContent.length).toBeLessThan(400);
    expect(stash.restore(stash.htmlContent)).toBe(html);
  });

  it("keeps small inline images such as lazy-load placeholders", () => {
    const tiny = base64Image(60, "gif");
    const html = `<img src="${tiny}" data-src="https://example.com/a.png">`;

    const stash = stashInlineImages(html, 1024);

    expect(stash.count).toBe(0);
    expect(stash.htmlContent).toBe(html);
  });

  it("uses placeholders longer than the lazy-load placeholder cutoff", () => {
    const stash = stashInlineImages(`<img src="${base64Image(2048)}">`, 1024);
    const placeholder = stash.htmlContent.slice(10, -2);

    expect(placeholder.startsWith("data:image/png;base64,")).toBe(true);
    expect(placeholder.length).toBeGreaterThan(200);
  });

  it("restores each image in its own place, including inside JSON", () => {
    const first = base64Image(2048, "jpeg");
    const second = base64Image(4096, "webp");
    const stash = stashInlineImages(
      `<img src="${first}"><img srcset="${second} 2x">`,
      1024,
    );

    const output = JSON.stringify({
      readableContent: { content: stash.htmlContent },
      metadata: { image: stash.htmlContent.match(/data:[^"\s]+/)![0] },
    });
    const restored = JSON.parse(stash.restore(output));

    expect(restored.readableContent.content).toBe(
      `<img src="${first}"><img srcset="${second} 2x">`,
    );
    expect(restored.metadata.image).toBe(first);
  });

  it("leaves data URIs shown as text alone", () => {
    const shown = base64Image(4096);
    const html = `<pre><code>${shown}</code></pre><p>See ${shown} above.</p>`;

    const stash = stashInlineImages(html, 1024);

    expect(stash.count).toBe(0);
    expect(stash.htmlContent).toBe(html);
  });

  it("leaves CSS shown as text alone", () => {
    const shown = base64Image(4096);
    const html = `<pre><code>.hero { background: url("${shown}") }</code></pre>`;

    const stash = stashInlineImages(html, 1024);

    expect(stash.count).toBe(0);
    expect(stash.htmlContent).toBe(html);
  });

  it("replaces images in CSS url() and style attributes", () => {
    const background = base64Image(4096);
    const inline = base64Image(4096, "jpeg");
    const html =
      `<style>.hero { background: url("${background}") }</style>` +
      `<div style="background-image: url(${inline})">Hi</div>`;

    const stash = stashInlineImages(html, 1024);

    expect(stash.count).toBe(2);
    expect(stash.htmlContent).not.toContain(background);
    expect(stash.htmlContent).not.toContain(inline);
    expect(stash.restore(stash.htmlContent)).toBe(html);
  });

  it("leaves non-image and non-base64 data URIs alone", () => {
    const svg = `data:image/svg+xml;utf8,<svg>${"x".repeat(5000)}</svg>`;
    const font = `data:font/woff2;base64,${"A".repeat(5000)}`;
    const html = `<img src='${svg}'><style>@font-face{src:url(${font})}</style>`;

    const stash = stashInlineImages(html, 1024);

    expect(stash.count).toBe(0);
    expect(stash.htmlContent).toBe(html);
  });

  it("doesn't touch text that looks like a placeholder from another run", () => {
    const first = stashInlineImages(`<img src="${base64Image(2048)}">`, 1024);
    const second = stashInlineImages(`<img src="${base64Image(2048)}">`, 1024);

    expect(second.restore(first.htmlContent)).toBe(first.htmlContent);
  });

  it("doesn't restore a data URI that sanitizing removed", () => {
    const svg = base64Image(4096, "svg+xml");
    const image = base64Image(4096);
    const stash = stashInlineImages(
      `<p><a href="${svg}">link</a><img src="${image}"></p>`,
      1024,
    );

    const restored = stash.restore(sanitize(stash.htmlContent));
    const unstashed = sanitize(
      `<p><a href="${svg}">link</a><img src="${image}"></p>`,
    );

    // Same result as sanitizing the original: the image stays, the data URI
    // link is dropped.
    expect(restored).toBe(unstashed);
    expect(restored).toContain(`src="${image}"`);
    expect(restored).not.toContain(svg);
  });
});
