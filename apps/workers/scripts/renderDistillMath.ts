import katex from "katex";

/** Convert Distill's custom elements before sanitization strips their wrappers. */
export function renderDistillMath(document: Document): void {
  for (const element of document.querySelectorAll("d-math")) {
    // Browser snapshots may already contain KaTeX's MathML and HTML fallback.
    // Reading textContent here would concatenate both with the TeX annotation.
    let math = element.querySelector("math")?.cloneNode(true) as
      | Element
      | undefined;
    if (!math) {
      const tex = element.textContent?.trim() ?? "";
      try {
        const template = document.createElement("template");
        template.innerHTML = katex.renderToString(tex, {
          output: "mathml",
          displayMode:
            element.hasAttribute("block") ||
            element.getAttribute("display") === "block",
          throwOnError: true,
          trust: false,
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
