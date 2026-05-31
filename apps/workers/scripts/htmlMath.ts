import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import katex from "katex";

import logger from "@karakeep/shared/logger";

function renderDistillMath(document: Document): void {
  const mathElements = Array.from(document.querySelectorAll("d-math"));

  for (const mathElement of mathElements) {
    const tex = mathElement.textContent?.trim();
    if (!tex) {
      mathElement.remove();
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
        throwOnError: true,
        trust: false,
      });

      const template = document.createElement("template");
      template.innerHTML = rendered;
      template.content
        .querySelectorAll("annotation")
        .forEach((annotation) => annotation.remove());

      mathElement.replaceWith(...Array.from(template.content.childNodes));
    } catch (error) {
      logger.warn(
        "[Crawler] Failed to render Distill math; falling back to plain text",
        {
          error,
          texLength: tex.length,
          texPreview: tex.slice(0, 120),
        },
      );
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
