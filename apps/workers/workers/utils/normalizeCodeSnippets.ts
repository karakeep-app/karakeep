/**
 * Google Cloud Blog embeds code in read-only editors rather than semantic code
 * blocks. Readability removes their textareas and rendered editor UI. Use the
 * complete copy payload so extraction also works before the editor loads or
 * when it only renders the visible lines.
 */
export function normalizeCodeSnippets(document: Document): void {
  for (const snippet of document.querySelectorAll("[data-text-to-copy]")) {
    const editor = snippet.querySelector(
      '[data-read-only=""], [data-read-only="true"]',
    );
    const text = snippet.getAttribute("data-text-to-copy");
    if (!editor || !text) {
      continue;
    }

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = text;
    pre.appendChild(code);
    snippet.replaceWith(pre);
  }
}
