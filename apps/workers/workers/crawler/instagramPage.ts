import type { RunProxyConfig } from "network";
import { fetchWithProxy } from "network";

import logger from "@karakeep/shared/logger";

/**
 * Instagram serves two different documents for the same post URL. A bare
 * client gets an empty React shell; a request carrying the fetch-metadata and
 * client-hint headers that a real browser navigation sends gets that shell
 * plus the post's data embedded as JSON. No cookies or session are involved
 * for a public post — these headers alone flip the switch.
 */
export const INSTAGRAM_BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "sec-ch-ua": '"Chromium";v="141", "Not?A_Brand";v="8"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
};

/** Instagram answered, but in a way that a later attempt may not repeat. */
export class InstagramTransientError extends Error {
  readonly name = "InstagramTransientError";
}

export interface InstagramMediaItem {
  kind: "image" | "video";
  imageUrl: string | null;
  videoUrl: string | null;
  /**
   * Instagram's own alt text with the "Photo by X on <date>." prefix removed,
   * e.g. `May be an image of text that says 'hello'`. Free, and often already
   * a rough transcription of any text in the picture.
   */
  altText: string | null;
}

export interface InstagramMedia {
  code: string;
  caption: string;
  author: string | null;
  /** YYYYMMDD, the same shape yt-dlp's upload_date has. */
  date: string | null;
  items: InstagramMediaItem[];
}

// media_type values in Instagram's payloads.
const MEDIA_TYPE_VIDEO = 2;
const MEDIA_TYPE_CAROUSEL = 8;

interface RawMedia {
  code: string;
  media_type: number;
  caption?: { text?: unknown } | null;
  user?: { username?: unknown; full_name?: unknown } | null;
  taken_at?: unknown;
  accessibility_caption?: unknown;
  image_versions2?: { candidates?: { url?: unknown }[] | null } | null;
  video_versions?: { url?: unknown }[] | null;
  carousel_media?: RawMedia[] | null;
}

function isRawMedia(o: unknown): o is RawMedia {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  return (
    typeof r.media_type === "number" &&
    typeof r.code === "string" &&
    (!!r.image_versions2 || Array.isArray(r.carousel_media))
  );
}

/** Depth-first search for the first object that looks like a media payload. */
function findMedia(o: unknown): RawMedia | null {
  if (!o || typeof o !== "object") return null;
  if (isRawMedia(o)) return o;
  for (const v of Object.values(o)) {
    const found = findMedia(v);
    if (found) return found;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Every alt text starts with "Photo by <name> on <Month day, year>." (or
 * "Video by …"). That repeats the author and date we already store, so it is
 * noise for search; the useful part is what follows.
 */
export function stripAltTextPrefix(alt: string): string | null {
  const rest = alt
    .replace(
      /^(?:Photo|Video|Image) by .+? on [A-Z][a-z]+ \d{1,2}, \d{4}\.?\s*/,
      "",
    )
    .trim();
  return rest.length > 0 ? rest : null;
}

function toItem(raw: RawMedia): InstagramMediaItem | null {
  const imageUrl = str(raw.image_versions2?.candidates?.[0]?.url);
  const videoUrl = str(raw.video_versions?.[0]?.url);
  if (!imageUrl && !videoUrl) return null;
  const alt = str(raw.accessibility_caption);
  return {
    kind: raw.media_type === MEDIA_TYPE_VIDEO ? "video" : "image",
    imageUrl,
    videoUrl,
    altText: alt ? stripAltTextPrefix(alt) : null,
  };
}

function toDate(takenAt: unknown): string | null {
  if (typeof takenAt !== "number" || !Number.isFinite(takenAt)) return null;
  const d = new Date(takenAt * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}${mm}${dd}`;
}

function normalize(raw: RawMedia): InstagramMedia {
  const rawItems =
    raw.media_type === MEDIA_TYPE_CAROUSEL && Array.isArray(raw.carousel_media)
      ? raw.carousel_media
      : [raw];
  return {
    code: raw.code,
    caption: str(raw.caption?.text) ?? "",
    author: str(raw.user?.full_name) ?? str(raw.user?.username),
    date: toDate(raw.taken_at),
    items: rawItems
      .filter(isRawMedia)
      .map(toItem)
      .filter((i): i is InstagramMediaItem => i !== null),
  };
}

/**
 * Pull the post out of the JSON blobs Instagram embeds in the page. Returns
 * null for a document without one — the shell served to non-browser clients,
 * a login wall, or a deleted post.
 */
export function parseInstagramPage(html: string): InstagramMedia | null {
  const blocks = html.matchAll(
    /<script type="application\/json"[^>]*data-sjs>(.*?)<\/script>/gs,
  );
  for (const [, json] of blocks) {
    if (!json.includes('"media_type"')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      continue;
    }
    const media = findMedia(parsed);
    if (media) return normalize(media);
  }
  return null;
}

export async function fetchInstagramPage(
  url: string,
  jobId: string,
  runProxy: RunProxyConfig,
  abortSignal: AbortSignal,
): Promise<string | null> {
  const response = await fetchWithProxy(
    url,
    {
      headers: INSTAGRAM_BROWSER_HEADERS,
      signal: AbortSignal.any([AbortSignal.timeout(20_000), abortSignal]),
    },
    runProxy,
  );
  if (response.status === 429 || response.status >= 500) {
    throw new InstagramTransientError(
      `Instagram page fetch returned HTTP ${response.status}`,
    );
  }
  if (!response.ok) {
    logger.warn(
      `[Crawler][${jobId}] Instagram page fetch for "${url}" returned HTTP ${response.status}`,
    );
    return null;
  }
  return await response.text();
}
