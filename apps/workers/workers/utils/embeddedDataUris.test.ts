import { describe, expect, test } from "vitest";

import { compactEmbeddedDataUris } from "./embeddedDataUris";

describe("embedded archive resources", () => {
  test("compacts repeated images and CSS fonts and restores exact output", () => {
    const image = `data:image/png;base64,${"abcd".repeat(4096)}`;
    const font = `data:font/woff2;base64,${"efgh".repeat(4096)}`;
    const html = `<style>@font-face{src:url('${font}')}</style><img src="${image}"><img src="${image}">`;
    const result = compactEmbeddedDataUris(html);
    expect(result.htmlContent.length).toBeLessThan(2000);
    expect(result.restore(result.htmlContent)).toBe(html);
    // Resources also appear outside Reader HTML, for example metadata.image.
    const compactImage = result.htmlContent.match(/src="([^"]+)"/)![1];
    expect(result.restore(compactImage)).toBe(image);
  });

  test("leaves tiny placeholders, ordinary URLs and non-base64 SVG unchanged", () => {
    const html =
      '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP"><img src="https://example.com/image.png"><img src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E">';
    const result = compactEmbeddedDataUris(html);
    expect(result.htmlContent).toBe(html);
    expect(result.restore(html)).toBe(html);
  });

  test("preserves MIME types and does not introduce tiny lazy-load placeholders", () => {
    const image = `data:image/png;base64,${"abcd".repeat(4096)}`;
    const result = compactEmbeddedDataUris(image);
    expect(result.htmlContent).toMatch(
      /^data:image\/png;base64,[a-z0-9+/=]+$/i,
    );
    expect(result.htmlContent.length).toBeGreaterThan(200);
    expect(result.restore(result.htmlContent)).toBe(image);
  });

  test("keeps restoration isolated between parser calls", () => {
    const image = `data:image/jpeg;base64,${"abcd".repeat(4096)}`;
    const first = compactEmbeddedDataUris(image);
    const second = compactEmbeddedDataUris(image);
    expect(first.restore(second.htmlContent)).toBe(second.htmlContent);
    expect(second.restore(second.htmlContent)).toBe(image);
  });
});
