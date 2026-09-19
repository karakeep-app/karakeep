/**
 * Stable, non-HTML representation of images embedded in a highlight.
 * Consumers that render images must parse and validate these references first.
 */
export const HIGHLIGHT_IMAGE_TOKEN_PREFIX = "[[karakeep-image:";
export const HIGHLIGHT_IMAGE_TOKEN_SUFFIX = "]]";

export interface HighlightImageReference {
  index: number | null;
  src: string;
  alt: string;
}

export function isSafeImageSource(source: string): boolean {
  const value = source.trim();
  if (!value || /^\s*javascript:/i.test(value)) {
    return false;
  }

  if (/^data:/i.test(value)) {
    return /^data:image\//i.test(value);
  }

  try {
    const url = new URL(value, "https://karakeep.invalid");
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function imageReferencesFromHighlightText(
  text: string | null,
): HighlightImageReference[] {
  if (!text) {
    return [];
  }

  const references: HighlightImageReference[] = [];
  const imagePattern = /\[\[karakeep-image:([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = imagePattern.exec(text))) {
    try {
      const reference = JSON.parse(
        decodeURIComponent(match[1]),
      ) as Partial<HighlightImageReference>;
      if (
        typeof reference.src === "string" &&
        isSafeImageSource(reference.src)
      ) {
        references.push({
          index:
            typeof reference.index === "number" &&
            Number.isInteger(reference.index) &&
            reference.index >= 0
              ? reference.index
              : null,
          src: reference.src,
          alt: typeof reference.alt === "string" ? reference.alt : "",
        });
      }
    } catch {
      // Leave malformed tokens as plain text.
    }
  }
  return references;
}

export function imageSourcesFromHighlightText(text: string | null): string[] {
  return imageReferencesFromHighlightText(text).map((image) => image.src);
}

export function highlightTextForDisplay(text: string | null): string {
  if (!text) {
    return "";
  }

  return text.replace(/\[\[karakeep-image:([^\]]+)\]\]/g, (token) => {
    const reference = imageReferencesFromHighlightText(token)[0];
    return reference
      ? `[Image${reference.alt ? `: ${reference.alt}` : ""}]`
      : token;
  });
}
