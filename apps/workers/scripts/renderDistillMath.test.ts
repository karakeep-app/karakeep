import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import katex from "katex";
import { describe, expect, it, vi } from "vitest";

import { renderDistillMath } from "./renderDistillMath";

function convert(html: string): string {
  const dom = new JSDOM(html);
  try {
    renderDistillMath(dom.window.document);
    return DOMPurify(dom.window).sanitize(dom.window.document.body.innerHTML);
  } finally {
    dom.window.close();
  }
}

describe("Distill reader math", () => {
  const tex = String.raw`W_{enc}^{\ell}`;

  it("limits the number of render attempts, including failed parses", () => {
    const spy = vi.spyOn(katex, "renderToString").mockImplementation(() => {
      throw new Error("Invalid formula");
    });
    try {
      const result = convert("<d-math>x</d-math>".repeat(501));
      expect(spy).toHaveBeenCalledTimes(500);
      expect(result).toBe("x".repeat(501));
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps oversized formulas as text without spending the render budget", () => {
    const spy = vi.spyOn(katex, "renderToString");
    try {
      const source = "x".repeat(4097);
      const result = convert(`<d-math>${source}</d-math><d-math>y</d-math>`);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(result).toContain(source);
      expect(result).toContain("<mi>y</mi>");
    } finally {
      spy.mockRestore();
    }
  });

  it("bounds aggregate source length and retains already rendered math", () => {
    const spy = vi.spyOn(katex, "renderToString").mockImplementation(() => {
      throw new Error("Invalid formula");
    });
    try {
      const result = convert(
        `<d-math>${"x".repeat(4000)}</d-math>`.repeat(26) +
          "<d-math><math><mi>z</mi></math></d-math>",
      );
      expect(spy).toHaveBeenCalledTimes(25);
      expect(result).toContain("x".repeat(104000));
      expect(result).toContain("<math><mi>z</mi></math>");
    } finally {
      spy.mockRestore();
    }
  });

  it("renders raw inline source as MathML without exposing its annotation", () => {
    const result = convert(`<p>Encoder <d-math>${tex}</d-math>.</p>`);
    expect(result).toContain("<math");
    expect(result).toContain("<msubsup>");
    expect(result).not.toContain(tex);
    expect(result).not.toContain("annotation");
    expect(result).not.toContain("d-math");
    expect(result).not.toContain('display="block"');
  });

  it.each(["block", 'display="block"'])(
    "preserves block layout for %s",
    (attr) => {
      expect(convert(`<d-math ${attr}>x^2</d-math>`)).toContain(
        'display="block"',
      );
    },
  );

  it("produces the same math from a rendered browser snapshot and raw source", () => {
    const rendered = katex.renderToString(tex);
    expect(convert(`<d-math>${rendered}</d-math>`)).toBe(
      convert(`<d-math>${tex}</d-math>`),
    );
  });

  it("preserves already rendered display math and is idempotent", () => {
    const rendered = katex.renderToString(tex, { displayMode: true });
    const result = convert(`<d-math block>${rendered}</d-math>`);
    expect(result).toBe(convert(`<d-math block>${tex}</d-math>`));
    expect(convert(result)).toBe(result);
  });

  it("keeps invalid TeX as text and removes executable HTML", () => {
    const result = convert(
      String.raw`<d-math>\notARealCommand{x}</d-math><img src=x onerror="alert(1)"><script>alert(2)</script>`,
    );
    expect(result).toContain(String.raw`\notARealCommand{x}`);
    expect(result).not.toMatch(/script|onerror|d-math/);
  });

  it("sanitizes preexisting MathML and removes annotation content", () => {
    const result = convert(
      '<d-math><math onclick="alert(1)"><mi>x</mi><annotation>duplicate</annotation><annotation-xml><img src=x onerror="alert(1)"></annotation-xml></math></d-math>',
    );
    expect(result).toContain("<mi>x</mi>");
    expect(result).not.toMatch(/onclick|onerror|duplicate|annotation|img/);
  });

  it("leaves ordinary text and native MathML alone", () => {
    const html = "<p>Price $20 and x^2.</p><math><mi>x</mi></math>";
    expect(convert(html)).toBe(html);
  });

  it("renders custom math retained by Readability", () => {
    const dom = new JSDOM(
      `<article><h1>Encoder weights</h1>${Array.from({ length: 6 }, () => `<p>${"The encoder transforms a feature vector into a representation. ".repeat(8)}<d-math>${tex}</d-math></p>`).join("")}</article>`,
    );
    try {
      const article = new Readability(dom.window.document).parse();
      expect(article?.content).toContain("d-math");
      expect(convert(article?.content ?? "")).toContain("<msubsup>");
    } finally {
      dom.window.close();
    }
  });
});
