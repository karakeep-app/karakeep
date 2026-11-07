import { describe, expect, test } from "vitest";

import {
  getHighlightContext,
  HighlightAnchor,
  resolveHighlightRange,
} from "./highlight-anchoring";

function anchorFor(text: string, quote: string, occurrence = 0) {
  let start = -1;
  for (let i = 0; i <= occurrence; i++) {
    start = text.indexOf(quote, start + 1);
  }
  if (start === -1) throw new Error("quote not found");
  const end = start + quote.length;
  return {
    startOffset: start,
    endOffset: end,
    text: quote,
    ...getHighlightContext(text, start, end),
  } satisfies HighlightAnchor;
}

function resolvedText(text: string, anchor: HighlightAnchor) {
  const range = resolveHighlightRange(text, anchor);
  return range ? text.slice(range.startOffset, range.endOffset) : null;
}

const ORIGINAL =
  "The quick brown fox jumps over the lazy dog. " +
  "Meanwhile, the cat sat on the mat and watched the fox. " +
  "In the end, the fox and the cat became friends.";

describe("resolveHighlightRange", () => {
  test("returns offsets unchanged when nothing moved", () => {
    const anchor = anchorFor(ORIGINAL, "the cat sat on the mat");
    expect(resolveHighlightRange(ORIGINAL, anchor)).toEqual({
      startOffset: anchor.startOffset,
      endOffset: anchor.endOffset,
    });
  });

  test("relocates after text is inserted before the highlight", () => {
    const anchor = anchorFor(ORIGINAL, "the cat sat on the mat");
    const updated = "A brand new intro paragraph. " + ORIGINAL;
    expect(resolvedText(updated, anchor)).toBe("the cat sat on the mat");
    expect(resolveHighlightRange(updated, anchor)?.startOffset).toBe(
      anchor.startOffset + "A brand new intro paragraph. ".length,
    );
  });

  test("relocates after text is removed before the highlight", () => {
    const anchor = anchorFor(ORIGINAL, "became friends");
    const updated = ORIGINAL.replace("Meanwhile, ", "");
    expect(resolvedText(updated, anchor)).toBe("became friends");
  });

  test("uses context to pick the right occurrence of a repeated quote", () => {
    // First "the fox" (end of second sentence), the other one is "the fox and".
    const anchor = anchorFor(ORIGINAL, "the fox", 0);
    // Shift everything so the old offset lands on a different occurrence.
    const updated = "Intro. ".repeat(5) + ORIGINAL;
    const range = resolveHighlightRange(updated, anchor)!;
    expect(updated.slice(range.startOffset, range.endOffset)).toBe("the fox");
    expect(updated.slice(range.endOffset, range.endOffset + 2)).toBe(". ");
    expect(updated.slice(range.startOffset - 8, range.startOffset)).toBe(
      "watched ",
    );
  });

  test("falls back to proximity when there's no stored context", () => {
    const anchor: HighlightAnchor = {
      ...anchorFor(ORIGINAL, "the fox", 1),
      prefix: null,
      suffix: null,
    };
    const updated = "x" + ORIGINAL;
    const range = resolveHighlightRange(updated, anchor)!;
    expect(range.startOffset).toBe(anchor.startOffset + 1);
  });

  test("tolerates whitespace changes", () => {
    const anchor = anchorFor(ORIGINAL, "the cat sat on the mat");
    const updated = ORIGINAL.replace(/ /g, "  ").replace(
      "cat  sat",
      "cat\nsat",
    );
    expect(resolvedText(updated, anchor)).toBe("the  cat\nsat  on  the  mat");
  });

  test("tolerates whitespace changes inside a multi-paragraph quote", () => {
    const original = "First paragraph ends here.\n\nSecond paragraph starts.";
    const anchor = anchorFor(original, "ends here.\n\nSecond");
    const updated =
      "Prelude. First paragraph ends here.\nSecond paragraph starts.";
    expect(resolvedText(updated, anchor)).toBe("ends here.\nSecond");
  });

  test("recovers an edited quote using its surrounding context", () => {
    const anchor = anchorFor(ORIGINAL, "watched the fox");
    const updated = ORIGINAL.replace("watched the fox", "observed the fox");
    expect(resolvedText(updated, anchor)).toBe("observed the fox");
  });

  test("returns null when the quote and its context are gone", () => {
    const anchor = anchorFor(ORIGINAL, "watched the fox");
    expect(resolveHighlightRange("Completely different content.", anchor)).toBe(
      null,
    );
  });

  test("keeps legacy highlights without text at their offsets", () => {
    const anchor = { startOffset: 4, endOffset: 9, text: null };
    expect(resolveHighlightRange(ORIGINAL, anchor)).toEqual({
      startOffset: 4,
      endOffset: 9,
    });
  });

  test("relocates legacy highlights that have text but no context", () => {
    const anchor = {
      startOffset: ORIGINAL.indexOf("lazy dog"),
      endOffset: ORIGINAL.indexOf("lazy dog") + "lazy dog".length,
      text: "lazy dog",
    };
    expect(resolvedText("New intro. " + ORIGINAL, anchor)).toBe("lazy dog");
  });

  test("keeps context aligned when the quote has edge whitespace", () => {
    const original = "Alpha quote Beta. Gamma quote Delta.";
    // Select the second " quote " including the spaces around it.
    const anchor = anchorFor(original, " quote ", 1);
    const updated = "Intro. ".repeat(5) + original;
    const range = resolveHighlightRange(updated, anchor)!;
    expect(updated.slice(range.startOffset, range.endOffset)).toBe("quote");
    expect(range.startOffset).toBe(updated.indexOf("Gamma quote") + 6);
  });

  test("measures distance in raw offsets for legacy highlights", () => {
    const original =
      "quote " + "x".repeat(40) + " quote" + " ".repeat(200) + "end";
    const anchor = { startOffset: 47, endOffset: 52, text: "quote" };
    expect(resolveHighlightRange("!" + original, anchor)?.startOffset).toBe(48);
  });

  test("prefers context recovery over a weak exact match elsewhere", () => {
    const original =
      "Earlier we mentioned the company briefly. " +
      "Later on, the founders built the company from scratch in a garage.";
    const anchor = anchorFor(original, "the company", 1);
    const updated = original.replace(
      "built the company from",
      "built our company from",
    );
    expect(resolvedText(updated, anchor)).toBe("our company");
  });
});
