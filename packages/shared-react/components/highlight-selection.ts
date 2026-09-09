import type { ZHighlightContent } from "@karakeep/shared/types/highlights";

const BLOCKS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "DL",
  "DT",
  "DD",
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
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TR",
  "UL",
]);

export function serializeHighlightRange(
  root: HTMLElement,
  range: Range,
): {
  startOffset: number;
  endOffset: number;
  text: string;
  content: ZHighlightContent;
} | null {
  if (range.collapsed || !root.contains(range.commonAncestorContainer))
    return null;
  // Element endpoint offsets count children, not characters.
  const offset = (node: Node, position: number) => {
    const prefix = root.ownerDocument.createRange();
    prefix.selectNodeContents(root);
    prefix.setEnd(node, position);
    return prefix.toString().length;
  };
  const images = Array.from(root.querySelectorAll("img"));
  const selectedImages = images.filter((image) => range.intersectsNode(image));
  const parts: ZHighlightContent["parts"] = [];
  let imageCursor = 0;
  let trailingSeparator = "";
  const appendText = (text: string) => {
    if (!text) return;
    trailingSeparator = "";
    const last = parts.at(-1);
    if (last?.type === "text") last.text += text;
    else parts.push({ type: "text", text });
  };
  const newline = () => {
    const last = parts.at(-1);
    if (last?.type === "text" && trailingSeparator === "\t") {
      last.text = last.text.slice(0, -1);
    }
    if (last && (last.type !== "text" || !last.text.endsWith("\n"))) {
      appendText("\n");
      trailingSeparator = "\n";
    }
  };
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? "");
      return;
    }
    if (
      node.nodeType !== Node.ELEMENT_NODE &&
      node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
    )
      return;
    const tag =
      node.nodeType === Node.ELEMENT_NODE ? (node as Element).tagName : "";
    if (tag === "BR") {
      appendText("\n");
      return;
    }
    if (tag === "IMG") {
      const original = selectedImages[imageCursor++];
      if (!original) return;
      const src = original.src;
      if (/^https?:\/\//i.test(src)) {
        parts.push({
          type: "image",
          index: images.indexOf(original),
          src,
          alt: original.alt,
        });
        trailingSeparator = "";
      } else if (original.alt) appendText(`[${original.alt}]`);
      return;
    }
    if (BLOCKS.has(tag)) newline();
    node.childNodes.forEach(visit);
    if (BLOCKS.has(tag)) newline();
    if (tag === "TD" || tag === "TH") {
      appendText("\t");
      trailingSeparator = "\t";
    }
  };
  visit(range.cloneContents());
  const last = parts.at(-1);
  if (last?.type === "text") {
    if (trailingSeparator)
      last.text = last.text.slice(0, -trailingSeparator.length);
    if (!last.text) parts.pop();
  }
  return {
    startOffset: offset(range.startContainer, range.startOffset),
    endOffset: offset(range.endContainer, range.endOffset),
    text: parts
      .map((part) =>
        part.type === "text" ? part.text : `[${part.alt || "Image"}]`,
      )
      .join(""),
    content: { version: 1, parts },
  };
}

export function getHighlightImages(
  root: HTMLElement,
  content?: ZHighlightContent | null,
) {
  const images = root.querySelectorAll("img");
  return (content?.parts ?? []).flatMap((part) => {
    if (part.type !== "image") return [];
    const image = images[part.index];
    // Do not move a highlight onto different content after a recrawl.
    return image?.src === part.src ? [image] : [];
  });
}
