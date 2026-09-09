import { JSDOM } from "jsdom";
import katex from "katex";
import { describe, expect, test } from "vitest";

import { sanitizeReadableMath } from "./readableMath";

const url = "https://example.com/article";
function inspect(html: string, check: (document: Document) => void) {
  const dom = new JSDOM(html);
  try {
    check(dom.window.document);
  } finally {
    dom.window.close();
  }
}

describe("reader Distill math", () => {
  test("renders the reported inline formula once", () => {
    const output = sanitizeReadableMath(
      String.raw`<p>where <d-math>W_{enc}^{\ell}</d-math> is the matrix.</p>`,
      url,
    );
    inspect(output, (doc) => {
      expect(doc.querySelectorAll("math")).toHaveLength(1);
      expect(doc.querySelectorAll("mi")).toHaveLength(5);
      expect(doc.querySelector("d-math, annotation")).toBeNull();
      expect(doc.body.textContent).toContain("is the matrix.");
    });
  });
  test.each(["block", 'display="block"'])("keeps display mode %s", (attr) => {
    inspect(
      sanitizeReadableMath(`<d-math ${attr}>x^2</d-math>`, url),
      (doc) => {
        expect(doc.querySelector("math")?.getAttribute("display")).toBe(
          "block",
        );
      },
    );
  });
  test("preserves pre-rendered KaTeX without triplicating its representations", () => {
    const rendered = katex.renderToString(String.raw`W_{enc}^{\ell}`);
    const output = sanitizeReadableMath(`<d-math>${rendered}</d-math>`, url);
    inspect(output, (doc) => {
      expect(doc.querySelectorAll("math")).toHaveLength(1);
      expect(doc.querySelectorAll("mi")).toHaveLength(5);
      expect(doc.querySelector("annotation, .katex-html")).toBeNull();
    });
    expect(sanitizeReadableMath(output, url)).toBe(output);
  });
  test("keeps standalone MathML unchanged", () => {
    const math =
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>';
    expect(sanitizeReadableMath(math, url)).toBe(math);
  });
  test("preserves unsupported TeX as text", () => {
    const output = sanitizeReadableMath(
      String.raw`<p><d-math>\unknown{</d-math></p>`,
      url,
    );
    expect(output).toBe(String.raw`<p>\unknown{</p>`);
  });
  test("removes empty custom wrappers", () => {
    expect(
      sanitizeReadableMath("<p>before<d-math> </d-math>after</p>", url),
    ).toBe("<p>beforeafter</p>");
  });
  test("sanitizes both preserved math and surrounding HTML", () => {
    const output = sanitizeReadableMath(
      '<script>alert(1)</script><img src=x onerror="alert(1)"><d-math block><math xmlns="http://www.w3.org/1998/Math/MathML" onclick="alert(1)"><mi>x</mi><annotation-xml encoding="text/html"><script>alert(1)</script></annotation-xml></math></d-math>',
      url,
    );
    inspect(output, (doc) => {
      expect(
        doc.querySelector("script, annotation-xml, [onclick], [onerror]"),
      ).toBeNull();
      expect(doc.querySelector("math")?.getAttribute("display")).toBe("block");
      expect(doc.querySelectorAll("mi")).toHaveLength(1);
    });
  });
});
