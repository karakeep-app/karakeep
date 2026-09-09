import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import katex from "katex";

// Bound synchronous rendering of untrusted pages; excess TeX stays readable.
const MAX_EQUATION_LENGTH = 4096;
const MAX_EQUATIONS = 256;
const MAX_TOTAL_TEX_LENGTH = 65536;

/** Convert Distill equations without reinterpreting an already rendered formula. */
export function sanitizeReadableMath(html: string, url: string): string {
  const dom = new JSDOM(html, { url });
  try {
    const document = dom.window.document;
    let renderedCount = 0;
    let renderedLength = 0;
    for (const equation of document.querySelectorAll("d-math")) {
      const block =
        equation.hasAttribute("block") ||
        equation.getAttribute("display") === "block";
      const existing = equation.querySelector("math");
      if (existing?.namespaceURI === "http://www.w3.org/1998/Math/MathML") {
        // KaTeX's textContent contains MathML, a TeX annotation and an HTML
        // fallback. Feeding that back into KaTeX repeats the equation.
        if (block) existing.setAttribute("display", "block");
        existing
          .querySelectorAll("annotation, annotation-xml")
          .forEach((node) => node.remove());
        equation.replaceWith(existing);
        continue;
      }

      const tex = equation.textContent?.trim() ?? "";
      if (!tex) {
        equation.remove();
        continue;
      }
      if (
        tex.length > MAX_EQUATION_LENGTH ||
        renderedCount >= MAX_EQUATIONS ||
        renderedLength + tex.length > MAX_TOTAL_TEX_LENGTH
      ) {
        equation.replaceWith(document.createTextNode(tex));
        continue;
      }
      // Failed parses also consume the page's rendering budget.
      renderedCount++;
      renderedLength += tex.length;
      try {
        const template = document.createElement("template");
        template.innerHTML = katex.renderToString(tex, {
          output: "mathml",
          displayMode: block,
          throwOnError: true,
          trust: false,
          strict: "ignore",
          maxExpand: 1000,
        });
        template.content
          .querySelectorAll("annotation")
          .forEach((node) => node.remove());
        equation.replaceWith(...template.content.childNodes);
      } catch {
        // Preserve readable input on unsupported TeX; never interpret it as HTML.
        equation.replaceWith(document.createTextNode(tex));
      }
    }
    return DOMPurify(dom.window).sanitize(document.body.innerHTML);
  } finally {
    dom.window.close();
  }
}
