// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  extractHighlightText,
  highlightTextForDisplay,
  imageReferencesFromHighlightText,
  isSafeImageSource,
} from "@karakeep/shared-react/components/highlight-utils";

describe("highlight text extraction", () => {
  it("preserves line breaks between blocks and explicit breaks", () => {
    const content = document.createElement("div");
    content.innerHTML = "<p>first<br />line</p><p>second</p>";
    document.body.append(content);

    const range = document.createRange();
    range.selectNodeContents(content);

    expect(extractHighlightText(range)).toBe("first\nline\nsecond");
  });

  it("keeps selected images as explicit indexed tokens", () => {
    const content = document.createElement("div");
    content.innerHTML =
      '<p>before <img src="https://example.com/figure.png?x=1&amp;y=2" alt="Figure"></p>';
    document.body.append(content);

    const image = content.querySelector("img");
    expect(image).not.toBeNull();

    const range = document.createRange();
    range.selectNode(image!);

    const text = extractHighlightText(range, content);
    expect(text).toMatch(/^\[\[karakeep-image:/);
    expect(imageReferencesFromHighlightText(text)).toEqual([
      {
        index: 0,
        src: "https://example.com/figure.png?x=1&y=2",
        alt: "Figure",
      },
    ]);
    expect(highlightTextForDisplay(text)).toBe("[Image: Figure]");
  });

  it("preserves literal image markup as text", () => {
    const text = '<img src="https://example.com/literal.png">';

    expect(highlightTextForDisplay(text)).toBe(text);
  });

  it("keeps table-cell boundaries in the selected text", () => {
    const content = document.createElement("div");
    content.innerHTML =
      "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>";
    document.body.append(content);

    const range = document.createRange();
    range.selectNodeContents(content);

    expect(extractHighlightText(range, content)).toBe("a\nb");
  });

  it("keeps duplicate image sources addressable by index", () => {
    const content = document.createElement("div");
    content.innerHTML =
      '<img src="https://example.com/same.png" alt="first"><img src="https://example.com/same.png" alt="second">';
    document.body.append(content);

    const images = content.querySelectorAll("img");
    const range = document.createRange();
    range.selectNode(images[1]);

    const text = extractHighlightText(range, content);
    expect(imageReferencesFromHighlightText(text)).toEqual([
      {
        index: 1,
        src: "https://example.com/same.png",
        alt: "second",
      },
    ]);
  });

  it("does not preserve executable image sources", () => {
    expect(isSafeImageSource("javascript:alert(1)")).toBe(false);
    expect(isSafeImageSource("data:text/html,alert(1)")).toBe(false);
    expect(isSafeImageSource("data:image/png;base64,AA==")).toBe(true);
  });
});
