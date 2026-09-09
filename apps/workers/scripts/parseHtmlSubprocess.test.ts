import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const parserPath = fileURLToPath(
  new URL("./parseHtmlSubprocess.ts", import.meta.url),
);
const prose =
  "This synthetic research article explains a calculation and its mathematical notation in enough detail for reader extraction. ".repeat(
    12,
  );

function extract(equations: string, metadataOnly = false) {
  const result = spawnSync(process.execPath, ["--import", "tsx", parserPath], {
    input: JSON.stringify({
      url: "https://example.com/research",
      jobId: "math-regression",
      metadataOnly,
      htmlContent: `<html><head><title>Research note</title></head><body><article><h1>Research note</h1><p>${prose}</p>${equations}<p>${prose}</p></article></body></html>`,
    }),
    encoding: "utf8",
    timeout: 30000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

describe("reader math extraction subprocess", () => {
  it("renders raw inline and block Distill equations as native MathML", () => {
    const result = extract(
      String.raw`<p>The encoder is <d-math>W_{enc}^{\ell}</d-math>.</p><d-math block>\frac{x}{2}</d-math>`,
    );
    const dom = new JSDOM(result.readableContent.content);
    try {
      const math = dom.window.document.querySelectorAll("math");
      expect(math).toHaveLength(2);
      expect(math[0].querySelector("msubsup")).not.toBeNull();
      expect(math[1].getAttribute("display")).toBe("block");
      expect(math[1].querySelector("mfrac")).not.toBeNull();
      expect(dom.window.document.querySelector("d-math")).toBeNull();
    } finally {
      dom.window.close();
    }
  }, 30000);

  it("keeps existing MathML without the rendered HTML fallback", () => {
    const result = extract(
      '<p>Equation <d-math><span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mi>x</mi><annotation encoding="application/x-tex">x</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">duplicate-visible-equation</span></span></d-math>.</p>',
    );
    const dom = new JSDOM(result.readableContent.content);
    try {
      expect(dom.window.document.querySelectorAll("math")).toHaveLength(1);
      expect(dom.window.document.querySelector("math mi")?.textContent).toBe(
        "x",
      );
      expect(dom.window.document.body.textContent).not.toContain(
        "duplicate-visible-equation",
      );
    } finally {
      dom.window.close();
    }
  }, 30000);

  it("keeps malformed TeX readable and still sanitizes active markup", () => {
    const result = extract(
      String.raw`<p><d-math>\frac{broken</d-math><img src="x" onerror="alert(1)"><script>alert(2)</script></p>`,
    );
    expect(result.readableContent.content).toContain(String.raw`\frac{broken`);
    expect(result.readableContent.content).not.toMatch(/<script|onerror=/i);
  }, 30000);

  it("does not enable trusted TeX commands or retain active MathML attributes", () => {
    const result = extract(
      String.raw`<p><d-math>\href{javascript:alert(1)}{x}</d-math><d-math><math xmlns="http://www.w3.org/1998/Math/MathML" onclick="alert(2)"><mi href="javascript:alert(3)">y</mi></math></d-math></p>`,
    );
    const dom = new JSDOM(result.readableContent.content);
    try {
      expect(
        dom.window.document.querySelector("[href], [onclick], script"),
      ).toBeNull();
      expect(dom.window.document.querySelector("math mi")?.textContent).toBe(
        "y",
      );
    } finally {
      dom.window.close();
    }
  }, 30000);

  it("does not create reader content for metadata-only requests", () => {
    expect(extract("<d-math>x</d-math>", true).readableContent).toBeNull();
  }, 30000);
});
