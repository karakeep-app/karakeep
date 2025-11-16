import { ZHighlightColor } from "@karakeep/shared/types/highlights";

export interface HighlightPosition {
  startOffset: number;
  endOffset: number;
  text: string | null;
}

export type Highlight = HighlightPosition & {
  id: string;
  color: ZHighlightColor;
};

export function isSelectionValid(
  range: Range,
  contentElement: HTMLElement,
): boolean {
  const commonAncestor = range.commonAncestorContainer;

  return (
    !range.collapsed &&
    (contentElement.contains(commonAncestor) ||
      contentElement === commonAncestor) &&
    contentElement.contains(range.startContainer) &&
    contentElement.contains(range.endContainer)
  );
}

export function getCharacterOffset(node: Node, parent: HTMLElement): number {
  let offset = 0;
  const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    if (walker.currentNode === node) break;
    offset += walker.currentNode.textContent?.length ?? 0;
  }

  return offset;
}

export function getHighlightFromRange(
  range: Range,
  contentElement: HTMLElement,
): HighlightPosition | null {
  if (!range || range.collapsed) return null;

  try {
    const startOffset = getGlobalOffset(
      range.startContainer,
      range.startOffset,
      contentElement,
    );
    const endOffset = getGlobalOffset(
      range.endContainer,
      range.endOffset,
      contentElement,
    );

    if (startOffset === -1 || endOffset === -1 || startOffset >= endOffset) {
      return null;
    }

    return {
      startOffset,
      endOffset,
      text: extractTextContent(range),
    };
  } catch (error) {
    console.error("Error getting highlight data:", error);
    return null;
  }
}

function getGlobalOffset(
  container: Node,
  offsetInNode: number,
  parentElement: HTMLElement,
): number {
  if (container.nodeType === Node.TEXT_NODE) {
    return getCharacterOffset(container, parentElement) + offsetInNode;
  }

  if (container.nodeType === Node.ELEMENT_NODE) {
    const childNode =
      offsetInNode < container.childNodes.length
        ? container.childNodes[offsetInNode]
        : null;

    if (childNode) {
      return getCharacterOffset(childNode, parentElement);
    } else {
      let offset = getCharacterOffset(container, parentElement);

      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        offset += walker.currentNode.textContent?.length ?? 0;
      }

      return offset;
    }
  }

  return -1;
}

export function extractTextContent(range: Range): string {
  const fragment = range.cloneContents();
  const container = document.createElement("div");
  container.appendChild(fragment);

  let text = "";

  const processNode = (node: Node, isFirst = true) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const isBlock = isBlockElement(element);

      if (isBlock && !isFirst && !text.endsWith("\n")) {
        text += "\n";
      }

      if (element.nodeName === "BR") {
        text += "\n";
      }

      let firstChild = true;
      for (const child of Array.from(element.childNodes)) {
        processNode(child, firstChild);
        firstChild = false;
      }

      if (isBlock && !text.endsWith("\n")) {
        text += "\n";
      }
    }
  };

  processNode(container);
  return text;
}

export function isBlockElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.display === "block" ||
    [
      "P",
      "DIV",
      "LI",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "BLOCKQUOTE",
    ].includes(element.nodeName)
  );
}

export function isElementVisible(rect: DOMRect): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom >= 0 &&
    rect.top <= window.innerHeight &&
    rect.right >= 0 &&
    rect.left <= window.innerWidth
  );
}

export function getFirstVisibleHighlight(
  highlightId: string,
  menuPosition?: { x: number; y: number },
): HTMLElement | null {
  const elements = document.querySelectorAll(
    `span[data-highlight-id="${highlightId}"]`,
  );
  let closestEl: HTMLElement | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const el of Array.from(elements)) {
    const rect = el.getBoundingClientRect();
    if (isElementVisible(rect)) {
      if (!menuPosition) {
        return el as HTMLElement;
      }
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = centerX - menuPosition.x;
      const dy = centerY - menuPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < minDistance) {
        minDistance = distance;
        closestEl = el as HTMLElement;
      }
    }
  }
  return closestEl;
}
