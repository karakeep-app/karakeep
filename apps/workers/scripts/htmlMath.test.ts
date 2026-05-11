import { describe, expect, test } from "vitest";

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

    expect(html).toContain(
      '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">',
    );
    expect(html).not.toContain("<d-math");
  });
});
