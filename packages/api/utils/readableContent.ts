import { z } from "zod";

import type { ZBookmarkReadableContentFormat } from "@karakeep/shared/types/bookmarks";

const zReadableContentCursor = z.object({
  version: z.literal(1),
  bookmarkId: z.string(),
  format: z.enum(["markdown", "text"]),
  contentVersion: z.string(),
  offset: z.number().int().nonnegative(),
});

export type ReadableContentCursor = z.infer<typeof zReadableContentCursor>;

export function encodeReadableContentCursor(
  cursor: ReadableContentCursor,
): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeReadableContentCursor(
  cursor: string,
): ReadableContentCursor | null {
  try {
    return zReadableContentCursor.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
  } catch {
    return null;
  }
}

function findChunkLength(
  characters: string[],
  maxChars: number,
  hasMore: boolean,
): number {
  if (!hasMore) {
    return characters.length;
  }

  const earliestBoundary = Math.floor(maxChars * 0.8);

  for (let index = characters.length - 1; index >= earliestBoundary; index--) {
    if (characters[index] === "\n" && characters[index - 1] === "\n") {
      return index + 1;
    }
  }
  for (let index = characters.length - 1; index >= earliestBoundary; index--) {
    if (characters[index] === "\n") {
      return index + 1;
    }
  }
  return characters.length;
}

export function chunkReadableContent({
  bookmarkId,
  content,
  contentVersion,
  format,
  maxChars,
  start = 0,
}: {
  bookmarkId: string;
  content: string;
  contentVersion: string;
  format: ZBookmarkReadableContentFormat;
  maxChars: number;
  start?: number;
}) {
  const characters: string[] = [];
  let total = 0;
  for (const character of content) {
    if (total >= start && characters.length < maxChars) {
      characters.push(character);
    }
    total++;
  }
  if (start > total) {
    return null;
  }

  const chunkLength = findChunkLength(
    characters,
    maxChars,
    start + characters.length < total,
  );
  const end = start + chunkLength;
  const nextCursor =
    end < total
      ? encodeReadableContentCursor({
          version: 1,
          bookmarkId,
          format,
          contentVersion,
          offset: end,
        })
      : null;

  return {
    content: characters.slice(0, chunkLength).join(""),
    range: {
      start,
      end,
      total,
    },
    nextCursor,
    truncated: nextCursor !== null,
  };
}
