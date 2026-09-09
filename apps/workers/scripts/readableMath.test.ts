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
  test("preserves oversized equations as text and still renders later ones", () => {
    const tex = "x".repeat(4097);
    inspect(
      sanitizeReadableMath(`<d-math>${tex}</d-math><d-math>y</d-math>`, url),
      (doc) => {
        expect(doc.querySelectorAll("math")).toHaveLength(1);
        expect(doc.body.textContent).toBe(tex + "y");
        expect(doc.querySelector("d-math")).toBeNull();
      },
    );
  });
  test("caps the number of rendered equations without losing their text", () => {
    inspect(
      sanitizeReadableMath("<d-math>x</d-math>".repeat(257), url),
      (doc) => {
        expect(doc.querySelectorAll("math")).toHaveLength(256);
        expect(doc.body.textContent).toBe("x".repeat(257));
        expect(doc.querySelector("d-math")).toBeNull();
      },
    );
  });
  test("caps aggregate TeX length even when each equation is within its limit", () => {
    const tex = "x" + " ".repeat(4094) + "y";
    inspect(
      sanitizeReadableMath(`<d-math>${tex}</d-math>`.repeat(17), url),
      (doc) => {
        expect(doc.querySelectorAll("math")).toHaveLength(16);
        expect(doc.body.textContent).toBe("xy".repeat(16) + tex);
      },
    );
  });
  test("counts failed parses against the rendering budget", () => {
    const tex = String.raw`\unknown`;
    expect(
      sanitizeReadableMath(
        `<d-math>${tex}</d-math>`.repeat(256) + "<d-math>y</d-math>",
        url,
      ),
    ).toBe(tex.repeat(256) + "y");
  });
  test("stops recursive macro expansion and preserves the input", () => {
    const tex = String.raw`\def\recur{\recur}\recur`;
    expect(sanitizeReadableMath(`<d-math>${tex}</d-math>`, url)).toBe(tex);
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
