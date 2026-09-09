import katex from "katex";

// Bound synchronous TeX work on untrusted pages. Beyond these limits, preserve
// the source as text so a large article can still be captured.
const MAX_FORMULAS = 500;
const MAX_FORMULA_LENGTH = 4096;
const MAX_TOTAL_LENGTH = 100_000;

/** Convert Distill's custom elements before sanitization strips their wrappers. */
export function renderDistillMath(document: Document): void {
  let rendered = 0;
  let remainingLength = MAX_TOTAL_LENGTH;
  for (const element of document.querySelectorAll("d-math")) {
    // Browser snapshots may already contain KaTeX's MathML and HTML fallback.
    // Reading textContent here would concatenate both with the TeX annotation.
    let math = element.querySelector("math")?.cloneNode(true) as
      | Element
      | undefined;
    if (!math) {
      const tex = element.textContent?.trim() ?? "";
      if (
        rendered >= MAX_FORMULAS ||
        tex.length > MAX_FORMULA_LENGTH ||
        tex.length > remainingLength
      ) {
        element.replaceWith(document.createTextNode(tex));
        continue;
      }
      // Failed parses consume the budget too.
      rendered++;
      remainingLength -= tex.length;
      try {
        const template = document.createElement("template");
        template.innerHTML = katex.renderToString(tex, {
          output: "mathml",
          displayMode:
            element.hasAttribute("block") ||
            element.getAttribute("display") === "block",
          throwOnError: true,
          trust: false,
          maxExpand: 1000,
        });
        math = template.content.querySelector("math") ?? undefined;
      } catch {
        // Keep malformed source readable, without treating it as HTML.
        element.replaceWith(document.createTextNode(tex));
        continue;
      }
    }
    if (math) {
      // Sanitizers may unwrap annotations, exposing duplicate TeX as plain text.
      math
        .querySelectorAll("annotation, annotation-xml")
        .forEach((n) => n.remove());
      element.replaceWith(math);
    }
  }
}
