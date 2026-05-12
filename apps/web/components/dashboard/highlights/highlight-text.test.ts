// @vitest-environment jsdom

import { describe, expect, test } from "vitest";

import { getHighlightTextFromRange } from "@karakeep/shared-react/components/highlight-text";

function selectElementContents(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range;
}

describe("getHighlightTextFromRange", () => {
  test("preserves consecutive structural breaks", () => {
    document.body.innerHTML = "<p>First<br><br>Second</p>";

    const paragraph = document.querySelector("p") as HTMLElement;

    expect(getHighlightTextFromRange(selectElementContents(paragraph))).toBe(
      "First\n\nSecond",
    );
  });

  test("preserves block breaks between selected paragraphs", () => {
    document.body.innerHTML = `
      <article>
        <p>First line</p>
        <p>Second <strong>line</strong></p>
      </article>
    `;

    const article = document.querySelector("article") as HTMLElement;

    expect(getHighlightTextFromRange(selectElementContents(article))).toBe(
      "First line\nSecond line",
    );
  });

  test("preserves explicit line breaks", () => {
    document.body.innerHTML = "<p>First<br>Second</p>";

    const paragraph = document.querySelector("p") as HTMLElement;

    expect(getHighlightTextFromRange(selectElementContents(paragraph))).toBe(
      "First\nSecond",
    );
  });

  test("keeps a readable marker for selected images", () => {
    document.body.innerHTML =
      '<p>Before <img alt="architecture diagram" src="/diagram.png"> after</p>';

    const paragraph = document.querySelector("p") as HTMLElement;

    expect(getHighlightTextFromRange(selectElementContents(paragraph))).toBe(
      "Before\n[Image: architecture diagram]\nafter",
    );
  });

  test("uses title attribute for image labels when alt is missing", () => {
    document.body.innerHTML =
      '<p>Before <img title="system overview" src="/diagram.png"> after</p>';

    const paragraph = document.querySelector("p") as HTMLElement;

    expect(getHighlightTextFromRange(selectElementContents(paragraph))).toBe(
      "Before\n[Image: system overview]\nafter",
    );
  });

  test("uses a concise marker for selected images without labels", () => {
    document.body.innerHTML = '<p>Before <img src="/diagram.png"> after</p>';

    const paragraph = document.querySelector("p") as HTMLElement;

    expect(getHighlightTextFromRange(selectElementContents(paragraph))).toBe(
      "Before\n[Image]\nafter",
    );
  });
});
