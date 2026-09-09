import { renderToString } from "katex";

/** Convert Distill's custom math elements without executing page scripts. */
export function normalizeDistillMath(document: Document): void {
  for (const equation of document.querySelectorAll("d-math")) {
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
