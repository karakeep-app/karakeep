import { useState } from "react";

import type { ZHighlight } from "@karakeep/shared/types/highlights";

import { useWhoAmI } from "./users";

/** Shared highlights must not make requests chosen by another user on open. */
export function useHighlightImages(highlight: ZHighlight) {
  const { data: viewer } = useWhoAmI();
  const [allowedKey, setAllowedKey] = useState<string | null>(null);
  const imageSources = highlight.content?.parts
    .filter((part) => part.type === "image")
    .map((part) => part.src);
  // Scope consent to this viewer, highlight and exact URLs, including when a
  // mounted card is reused for a different result or the account changes.
  const key = JSON.stringify([
    viewer?.id,
    highlight.id,
    highlight.userId,
    imageSources,
  ]);
  const allowImages =
    (!!viewer?.id && viewer.id === highlight.userId) || allowedKey === key;
  return {
    allowImages,
    hasBlockedImages: !!imageSources?.length && !allowImages,
    loadImages: () => setAllowedKey(key),
  };
}
