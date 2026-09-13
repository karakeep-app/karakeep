import { renderToString } from "katex";

// Bound additional normalization work; the subprocess still enforces its own
// resource limits. Equations beyond this budget retain readable source.
const MAX_EQUATIONS = 512;
const MAX_TEX_PER_EQUATION = 4096;
const MAX_TOTAL_TEX = 128 * 1024;

/** Convert Distill's custom math elements without executing page scripts. */
export function normalizeDistillMath(document: Document): void {
  let equationsRemaining = MAX_EQUATIONS;
  let texRemaining = MAX_TOTAL_TEX;
  for (const equation of document.querySelectorAll("d-math")) {
    if (equationsRemaining-- <= 0) break;
    const existing = equation.querySelector("math");
    const displayMode =
      equation.hasAttribute("block") ||
      existing?.getAttribute("display") === "block";
    let math: Element;

    if (existing) {
      // Snapshot HTML often contains MathML, its TeX annotation and an HTML
      // fallback. Re-parsing the parent's text would combine all three.
      math = existing.cloneNode(true) as Element;
    } else {
      const tex = equation.textContent?.trim();
      if (!tex) continue;
      if (tex.length > MAX_TEX_PER_EQUATION) continue;
      if (tex.length > texRemaining) break;
      // Failed parses consume the same budget as successful ones.
      texRemaining -= tex.length;
      try {
        const container = document.createElement("div");
        container.innerHTML = renderToString(tex, {
          output: "mathml",
          displayMode,
          throwOnError: true,
          trust: false,
          strict: "ignore",
          maxExpand: 1000,
          maxSize: 10,
        });
        const rendered = container.querySelector("math");
        if (!rendered) continue;
        math = rendered;
      } catch {
        // Unsupported or malformed TeX should remain readable, not abort the
        // entire article extraction. DOMPurify still sanitizes the result.
        continue;
      }
    }

    math.setAttribute("display", displayMode ? "block" : "inline");
    const wrapper = document.createElement(displayMode ? "div" : "span");
    wrapper.appendChild(math);
    equation.replaceWith(wrapper);
  }
}
