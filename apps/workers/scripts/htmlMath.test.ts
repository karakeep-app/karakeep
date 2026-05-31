import { describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";

import { sanitizeReadableHtml } from "./htmlMath";

describe("sanitizeReadableHtml", () => {
  test("renders Distill inline math as native MathML before sanitizing", () => {
    const html = sanitizeReadableHtml(
      `<p>where <d-math>W_{enc}^{\\ell}</d-math> is the encoder matrix.</p>`,
      "https://transformer-circuits.pub/2025/attribution-graphs/methods.html",
    );

    expect(html).toContain("<math");
    expect(html).toContain("<msubsup>");
    expect(html).not.toContain("<d-math");
    expect(html).not.toContain("<annotation");
  });

  test("preserves Distill display math mode", () => {
    const html = sanitizeReadableHtml(
      `<d-math block>\\sum_i x_i</d-math>`,
      "https://example.com/article",
    );

    const dom = new JSDOM(`<body>${html}</body>`);
    const math = dom.window.document.querySelector("math");

    expect(math?.namespaceURI).toBe("http://www.w3.org/1998/Math/MathML");
    expect(math?.getAttribute("display")).toBe("block");
    expect(html).not.toContain("<d-math");

    dom.window.close();
  });

  test("falls back to plain text for invalid math", () => {
    const html = sanitizeReadableHtml(
      `<p><d-math>\\UNDEFINED{</d-math></p>`,
      "https://example.com/article",
    );

    expect(html).toContain("\\UNDEFINED{");
    expect(html).not.toContain("<math");
    expect(html).not.toContain("<d-math");
  });

  test("drops empty Distill math elements during sanitization", () => {
    const html = sanitizeReadableHtml(
      `<p>before <d-math> </d-math> after</p>`,
      "https://example.com/article",
    );

    expect(html).toMatch(/^<p>before\s+after<\/p>$/);
    expect(html).not.toContain("<d-math");
  });
});
