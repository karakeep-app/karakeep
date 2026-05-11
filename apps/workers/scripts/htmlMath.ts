import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import katex from "katex";

function renderDistillMath(document: Document): void {
  const mathElements = Array.from(document.querySelectorAll("d-math"));

  for (const mathElement of mathElements) {
    const tex = mathElement.textContent?.trim();
    if (!tex) {
      continue;
    }

    const displayMode =
      mathElement.hasAttribute("block") ||
      mathElement.getAttribute("display") === "block";

    try {
      const rendered = katex.renderToString(tex, {
        displayMode,
        output: "mathml",
        strict: "ignore",
        throwOnError: false,
        trust: false,
      });

      const renderedDom = new JSDOM(rendered);
      try {
        renderedDom.window.document
          .querySelectorAll("annotation")
          .forEach((annotation) => annotation.remove());

        const replacementNodes = Array.from(
          renderedDom.window.document.body.childNodes,
          (node) => document.importNode(node, true),
        );

        mathElement.replaceWith(...replacementNodes);
      } finally {
        renderedDom.window.close();
      }
    } catch {
      mathElement.replaceWith(document.createTextNode(tex));
    }
  }
}

export function sanitizeReadableHtml(htmlContent: string, url: string): string {
  const dom = new JSDOM(`<body>${htmlContent}</body>`, { url });
  try {
    renderDistillMath(dom.window.document);

    const purify = DOMPurify(dom.window);
    return purify.sanitize(dom.window.document.body.innerHTML);
  } finally {
    dom.window.close();
  }
}
