const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);

function appendLineBreak(parts: string[]) {
  const last = parts[parts.length - 1];
  if (last !== "\n") {
    parts.push("\n");
  }
}

function getImageLabel(element: HTMLElement) {
  const label =
    element.getAttribute("alt")?.trim() ||
    element.getAttribute("title")?.trim() ||
    "Image";

  return `[Image: ${label}]`;
}

function visitHighlightNode(node: Node, parts: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    parts.push(node.textContent ?? "");
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as HTMLElement;
  const tagName = element.tagName;

  if (tagName === "BR") {
    appendLineBreak(parts);
    return;
  }

  if (tagName === "IMG") {
    appendLineBreak(parts);
    parts.push(getImageLabel(element));
    appendLineBreak(parts);
    return;
  }

  const isBlock = BLOCK_TAGS.has(tagName);
  if (isBlock && parts.length > 0) {
    appendLineBreak(parts);
  }

  for (const child of Array.from(element.childNodes)) {
    visitHighlightNode(child, parts);
  }

  if (isBlock) {
    appendLineBreak(parts);
  }
}

export function normalizeHighlightText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v \u00a0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function getHighlightTextFromRange(range: Range) {
  const fragment = range.cloneContents();
  const parts: string[] = [];

  for (const child of Array.from(fragment.childNodes)) {
    visitHighlightNode(child, parts);
  }

  return normalizeHighlightText(parts.join(""));
}
