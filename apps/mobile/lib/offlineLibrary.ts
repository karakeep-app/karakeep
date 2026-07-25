import { useMemo } from "react";
import { createMMKV, useMMKVString } from "react-native-mmkv";
import superjson from "superjson";
import { z } from "zod";

import {
  BookmarkTypes,
  zBookmarkSchema,
} from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkTitle,
  getSourceUrl,
} from "@karakeep/shared/utils/bookmarkUtils";

import type { Settings } from "./settings";

// The article body lives under its own key so that callers who only need the
// bookmark's metadata never pay to deserialize megabytes of HTML.
export const OFFLINE_LIBRARY_SCHEMA_VERSION = 3 as const;
// Versioned keys: records written by an older schema are simply invisible, so a
// stale manifest can never claim an article the current parser would reject.
const MANIFEST_PREFIX = `manifest:v${OFFLINE_LIBRARY_SCHEMA_VERSION}:`;
const ARTICLE_PREFIX = `article:v${OFFLINE_LIBRARY_SCHEMA_VERSION}:`;
const CONTENT_PREFIX = `content:v${OFFLINE_LIBRARY_SCHEMA_VERSION}:`;

const offlineLibraryStorage = createMMKV({
  id: "karakeep-offline-library",
});

// Callers hand this in with the content populated; the body is split out before
// it is stored, so the persisted record always carries a null htmlContent.
const zOfflineArticle = z.object({
  schemaVersion: z.literal(OFFLINE_LIBRARY_SCHEMA_VERSION),
  bookmarkId: z.string(),
  savedAt: z.number(),
  bookmark: zBookmarkSchema,
});

const zOfflineArticleContent = z.object({
  schemaVersion: z.literal(OFFLINE_LIBRARY_SCHEMA_VERSION),
  bookmarkId: z.string(),
  htmlContent: z.string(),
});

const zOfflineLibraryItem = z.object({
  bookmarkId: z.string(),
  savedAt: z.number(),
  displayTitle: z.string(),
  url: z.string().optional(),
});

const zOfflineLibraryManifest = z.array(zOfflineLibraryItem);

export type OfflineArticle = z.infer<typeof zOfflineArticle>;
export type OfflineLibraryItem = z.infer<typeof zOfflineLibraryItem>;

function encodeKeyPart(value: string) {
  return encodeURIComponent(value);
}

function manifestKey(scope: string) {
  return `${MANIFEST_PREFIX}${encodeKeyPart(scope)}`;
}

function articleKey(scope: string, bookmarkId: string) {
  return `${ARTICLE_PREFIX}${encodeKeyPart(scope)}:${encodeKeyPart(bookmarkId)}`;
}

function articlePrefix(scope: string) {
  return `${ARTICLE_PREFIX}${encodeKeyPart(scope)}:`;
}

function contentKey(scope: string, bookmarkId: string) {
  return `${CONTENT_PREFIX}${encodeKeyPart(scope)}:${encodeKeyPart(bookmarkId)}`;
}

function contentPrefix(scope: string) {
  return `${CONTENT_PREFIX}${encodeKeyPart(scope)}:`;
}

function parseManifest(raw: string | undefined): OfflineLibraryItem[] {
  if (!raw) {
    return [];
  }

  try {
    const result = zOfflineLibraryManifest.safeParse(
      superjson.parse<unknown>(raw),
    );
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

// Every bookmark card reads the manifest, so parse each revision only once.
let lastParsedManifest:
  | { raw: string | undefined; items: OfflineLibraryItem[] }
  | undefined;

function parseManifestMemoized(raw: string | undefined): OfflineLibraryItem[] {
  // Not `lastParsedManifest?.raw === raw`: an empty library has raw ===
  // undefined, which would match an unset cache and dereference it.
  if (lastParsedManifest !== undefined && lastParsedManifest.raw === raw) {
    return lastParsedManifest.items;
  }

  const items = parseManifest(raw).sort(
    (left, right) => right.savedAt - left.savedAt,
  );
  lastParsedManifest = { raw, items };
  return items;
}

function writeManifest(scope: string, items: OfflineLibraryItem[]) {
  offlineLibraryStorage.set(
    manifestKey(scope),
    superjson.stringify(
      [...items].sort((left, right) => right.savedAt - left.savedAt),
    ),
  );
}

function parseOfflineArticle(
  raw: string | undefined,
  expectedBookmarkId: string,
): OfflineArticle | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const result = zOfflineArticle.safeParse(superjson.parse<unknown>(raw));
    if (
      !result.success ||
      result.data.bookmarkId !== expectedBookmarkId ||
      result.data.bookmark.id !== expectedBookmarkId
    ) {
      return undefined;
    }
    return result.data;
  } catch {
    return undefined;
  }
}

function readOfflineArticle(scope: string, bookmarkId: string) {
  return parseOfflineArticle(
    offlineLibraryStorage.getString(articleKey(scope, bookmarkId)),
    bookmarkId,
  );
}

function parseOfflineArticleContent(
  raw: string | undefined,
  expectedBookmarkId: string,
): string | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const result = zOfflineArticleContent.safeParse(
      superjson.parse<unknown>(raw),
    );
    if (!result.success || result.data.bookmarkId !== expectedBookmarkId) {
      return undefined;
    }
    return result.data.htmlContent;
  } catch {
    return undefined;
  }
}

function readOfflineArticleContent(scope: string, bookmarkId: string) {
  return parseOfflineArticleContent(
    offlineLibraryStorage.getString(contentKey(scope, bookmarkId)),
    bookmarkId,
  );
}

// Text bodies are small and already inline on the bookmark; only links keep a
// separate content record.
function isRenderableArticle(article: OfflineArticle, hasContent: boolean) {
  const { content } = article.bookmark;
  if (content.type === BookmarkTypes.TEXT) {
    return true;
  }

  return content.type === BookmarkTypes.LINK && hasContent;
}

function splitArticleContent(bookmark: OfflineArticle["bookmark"]) {
  if (bookmark.content.type === BookmarkTypes.TEXT) {
    return { bookmark, htmlContent: undefined };
  }

  if (
    bookmark.content.type === BookmarkTypes.LINK &&
    typeof bookmark.content.htmlContent === "string"
  ) {
    return {
      bookmark: {
        ...bookmark,
        content: { ...bookmark.content, htmlContent: null },
      },
      htmlContent: bookmark.content.htmlContent,
    };
  }

  return undefined;
}

function getDisplayTitle(bookmark: OfflineArticle["bookmark"]) {
  const title = getBookmarkTitle(bookmark)?.trim();
  if (title) {
    return title;
  }

  if (bookmark.content.type === BookmarkTypes.TEXT) {
    const firstLine = bookmark.content.text.trim().split("\n", 1)[0];
    if (firstLine) {
      return firstLine.slice(0, 120);
    }
  }

  return "Untitled bookmark";
}

export function getOfflineLibraryScope(
  settings: Pick<Settings, "address" | "apiKeyId">,
) {
  return `${settings.address}|${settings.apiKeyId ?? "anon"}`;
}

function restoreKey(key: string, raw: string | undefined) {
  if (raw !== undefined) {
    offlineLibraryStorage.set(key, raw);
  } else {
    offlineLibraryStorage.remove(key);
  }
}

export function saveOfflineArticle(scope: string, article: OfflineArticle) {
  const parsed = zOfflineArticle.safeParse(article);
  const split = parsed.success
    ? splitArticleContent(parsed.data.bookmark)
    : undefined;
  if (
    !parsed.success ||
    !split ||
    parsed.data.bookmarkId !== parsed.data.bookmark.id
  ) {
    throw new Error("The article does not contain a complete offline copy.");
  }

  const key = articleKey(scope, article.bookmarkId);
  const bodyKey = contentKey(scope, article.bookmarkId);
  const currentManifestRaw = offlineLibraryStorage.getString(
    manifestKey(scope),
  );
  const currentArticleRaw = offlineLibraryStorage.getString(key);
  const currentContentRaw = offlineLibraryStorage.getString(bodyKey);

  try {
    if (split.htmlContent !== undefined) {
      offlineLibraryStorage.set(
        bodyKey,
        superjson.stringify({
          schemaVersion: OFFLINE_LIBRARY_SCHEMA_VERSION,
          bookmarkId: parsed.data.bookmarkId,
          htmlContent: split.htmlContent,
        }),
      );
    } else {
      offlineLibraryStorage.remove(bodyKey);
    }

    offlineLibraryStorage.set(
      key,
      superjson.stringify({ ...parsed.data, bookmark: split.bookmark }),
    );

    const stored = readOfflineArticle(scope, article.bookmarkId);
    const storedContent = readOfflineArticleContent(scope, article.bookmarkId);
    if (!stored || !isRenderableArticle(stored, storedContent !== undefined)) {
      throw new Error("The offline copy could not be verified.");
    }

    const current = parseManifest(currentManifestRaw);
    const sourceUrl = getSourceUrl(parsed.data.bookmark);
    const item: OfflineLibraryItem = {
      bookmarkId: parsed.data.bookmarkId,
      savedAt: parsed.data.savedAt,
      displayTitle: getDisplayTitle(parsed.data.bookmark),
      ...(sourceUrl ? { url: sourceUrl } : {}),
    };
    writeManifest(scope, [
      item,
      ...current.filter((entry) => entry.bookmarkId !== parsed.data.bookmarkId),
    ]);
  } catch (error) {
    restoreKey(key, currentArticleRaw);
    restoreKey(bodyKey, currentContentRaw);
    restoreKey(manifestKey(scope), currentManifestRaw);
    throw error;
  }
}

export function removeOfflineArticle(scope: string, bookmarkId: string) {
  const current = parseManifest(
    offlineLibraryStorage.getString(manifestKey(scope)),
  );
  writeManifest(
    scope,
    current.filter((entry) => entry.bookmarkId !== bookmarkId),
  );
  offlineLibraryStorage.remove(articleKey(scope, bookmarkId));
  offlineLibraryStorage.remove(contentKey(scope, bookmarkId));
}

export function removeAllOfflineArticles(scope: string) {
  writeManifest(scope, []);
  for (const key of offlineLibraryStorage.getAllKeys()) {
    if (
      key.startsWith(articlePrefix(scope)) ||
      key.startsWith(contentPrefix(scope))
    ) {
      offlineLibraryStorage.remove(key);
    }
  }
}

export function clearOfflineLibrary() {
  offlineLibraryStorage.clearAll();
}

export function reconcileOfflineLibrary(scope: string) {
  const current = parseManifest(
    offlineLibraryStorage.getString(manifestKey(scope)),
  );
  const storedKeys = new Set(offlineLibraryStorage.getAllKeys());
  const validItems: OfflineLibraryItem[] = [];
  const validKeys = new Set<string>();

  for (const item of current) {
    const key = articleKey(scope, item.bookmarkId);
    const bodyKey = contentKey(scope, item.bookmarkId);
    const article = readOfflineArticle(scope, item.bookmarkId);
    // Presence is checked by key rather than by parsing: this runs over the
    // whole library, and the bodies are the thing worth not reading.
    if (article && isRenderableArticle(article, storedKeys.has(bodyKey))) {
      validItems.push(item);
      validKeys.add(key);
      if (storedKeys.has(bodyKey)) {
        validKeys.add(bodyKey);
      }
    } else {
      offlineLibraryStorage.remove(key);
      offlineLibraryStorage.remove(bodyKey);
    }
  }

  for (const key of storedKeys) {
    if (
      (key.startsWith(articlePrefix(scope)) ||
        key.startsWith(contentPrefix(scope))) &&
      !validKeys.has(key)
    ) {
      offlineLibraryStorage.remove(key);
    }
  }

  writeManifest(scope, validItems);
}

// Metadata only — the article body is not read. Use useOfflineArticleContent
// when you actually need to render it.
export function useOfflineArticle(scope: string, bookmarkId: string) {
  const [rawArticle] = useMMKVString(
    articleKey(scope, bookmarkId),
    offlineLibraryStorage,
  );
  return useMemo(
    () => parseOfflineArticle(rawArticle, bookmarkId),
    [bookmarkId, rawArticle],
  );
}

export function useOfflineArticleContent(scope: string, bookmarkId: string) {
  const [rawContent] = useMMKVString(
    contentKey(scope, bookmarkId),
    offlineLibraryStorage,
  );
  return useMemo(
    () => parseOfflineArticleContent(rawContent, bookmarkId),
    [bookmarkId, rawContent],
  );
}

export function useOfflineLibrary(scope: string) {
  const [rawManifest] = useMMKVString(
    manifestKey(scope),
    offlineLibraryStorage,
  );
  return useMemo(() => parseManifestMemoized(rawManifest), [rawManifest]);
}

// Deliberately manifest-based: this runs once per rendered bookmark card, so it
// must not deserialize the (potentially multi-megabyte) article records.
export function useIsAvailableOffline(scope: string, bookmarkId: string) {
  const items = useOfflineLibrary(scope);
  return useMemo(
    () => items.some((item) => item.bookmarkId === bookmarkId),
    [items, bookmarkId],
  );
}
