import {
  HIGHLIGHT_IMAGE_TOKEN_PREFIX,
  HIGHLIGHT_IMAGE_TOKEN_SUFFIX,
  imageReferencesFromHighlightText,
  isSafeImageSource,
} from "@karakeep/shared/utils/highlightUtils";
import type { HighlightImageReference } from "@karakeep/shared/utils/highlightUtils";

export {
  HIGHLIGHT_IMAGE_TOKEN_PREFIX,
  HIGHLIGHT_IMAGE_TOKEN_SUFFIX,
  type HighlightImageReference,
  highlightTextForDisplay,
  imageReferencesFromHighlightText,
  imageSourcesFromHighlightText,
  isSafeImageSource,
} from "@karakeep/shared/utils/highlightUtils";

const BLOCK_ELEMENTS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "DL",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
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
  "TD",
  "TH",
  "TR",
  "UL",
]);

/**
 * Image selections are encoded with an explicit token so literal HTML in a
 * text highlight can never turn into a network request when it is displayed.
 */
export function serializeHighlightImage(
  image: HTMLImageElement,
  index: number | null = null,
): string {
  const src = image.getAttribute("src");
  if (!src || !isSafeImageSource(src)) {
    return "[Image]";
  }

  const alt = image.getAttribute("alt") ?? "";
  return serializeHighlightImageReference({ index, src, alt });
}

function serializeHighlightImageReference(
  reference: HighlightImageReference,
): string {
  return `${HIGHLIGHT_IMAGE_TOKEN_PREFIX}${encodeURIComponent(
    JSON.stringify(reference),
  )}${HIGHLIGHT_IMAGE_TOKEN_SUFFIX}`;
}

function isBlockElement(element: Element): boolean {
  return BLOCK_ELEMENTS.has(element.tagName);
}

/**
 * Extract a selection in the same character-offset coordinate system used by
 * highlights, while preserving line breaks and selected images for the
 * highlight list.
 */
export function extractHighlightText(
  range: Range,
  contentElement?: HTMLElement,
): string {
  const fragment = range.cloneContents();
  let value = "";
  const allImages = contentElement
    ? Array.from(contentElement.querySelectorAll("img"))
    : [];
  const selectedImages = contentElement
    ? allImages.filter((image) => range.intersectsNode(image))
    : [];
  let selectedImageIndex = 0;

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      value += node.textContent ?? "";
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      for (const child of Array.from(node.childNodes)) {
        visit(child);
      }
      return;
    }

    const element = node as HTMLElement;
    if (element.tagName === "BR") {
      value += "\n";
      return;
    }

    if (element.tagName === "IMG") {
      const originalImage = selectedImages[selectedImageIndex];
      const imageIndex = originalImage
        ? allImages.indexOf(originalImage)
        : null;
      value += serializeHighlightImage(
        element as HTMLImageElement,
        imageIndex !== null && imageIndex >= 0 ? imageIndex : null,
      );
      selectedImageIndex += 1;
      return;
    }

    const isBlock = isBlockElement(element);
    if (isBlock && value && !value.endsWith("\n")) {
      value += "\n";
    }

    for (const child of Array.from(element.childNodes)) {
      visit(child);
    }

    if (isBlock && value && !value.endsWith("\n")) {
      value += "\n";
    }
  };

  visit(fragment);
  return value.replace(/\n+$/g, "");
}
