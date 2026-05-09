import { JSDOM } from "jsdom";
import { fetchWithProxy } from "network";

import type {
  AdapterExtractInput,
  ExtractedContent,
  PlatformAdapter,
} from "./types";

export const X_ADAPTER_ID = "x";
export const X_ADAPTER_VERSION = "2026-05-09";
export const X_IMAGE_REFERER = "https://x.com/";

const TWITTER_EPOCH_MS = 1288834974657n;
const STATUS_PATH_PATTERN = /^\/([^/]+)\/status(?:es)?\/(\d+)(?:\/|$)/;
const X_HOSTS = new Set(["x.com", "twitter.com", "mobile.twitter.com"]);

function metaContent(document: Document, selector: string): string | null {
  return (
    document.querySelector<HTMLMetaElement>(selector)?.content?.trim() || null
  );
}

function metaContents(document: Document, selector: string): string[] {
  return Array.from(document.querySelectorAll<HTMLMetaElement>(selector))
    .map((meta) => meta.content.trim())
    .filter(Boolean);
}

function absolutizeUrl(url: string | null | undefined, baseUrl: string) {
  if (!url) {
    return null;
  }
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("data:")) {
    return null;
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseStatusPath(url: string): { handle: string; tweetId: string } {
  const parsed = new URL(url);
  const match = parsed.pathname.match(STATUS_PATH_PATTERN);
  if (!match) {
    throw new Error("X/Twitter URL is not a status URL");
  }
  return { handle: match[1], tweetId: match[2] };
}

function dateFromTweetId(tweetId: string): string | null {
  try {
    const id = BigInt(tweetId);
    if (id <= 0n) {
      return null;
    }
    const timestampMs = (id >> 22n) + TWITTER_EPOCH_MS;
    return new Date(Number(timestampMs)).toISOString();
  } catch {
    return null;
  }
}

function stripTrailingProductName(value: string): string {
  return value
    .replace(/\s+\/\s+(?:X|Twitter)\s*$/i, "")
    .replace(/\s+on\s+(?:X|Twitter)\s*$/i, "")
    .trim();
}

function extractTitleParts(rawTitle: string | null): {
  author: string | null;
  tweetText: string | null;
} {
  if (!rawTitle) {
    return { author: null, tweetText: null };
  }

  const title = stripTrailingProductName(rawTitle);
  const match = title.match(
    /^(.*?)\s+on\s+(?:X|Twitter):\s*["“](.*)["”]\s*$/is,
  );
  if (match) {
    return {
      author: match[1].trim() || null,
      tweetText: match[2].trim() || null,
    };
  }

  return { author: null, tweetText: title || null };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function findJsonLdPosting(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const types = arrayValue(record["@type"]).filter(
    (type): type is string => typeof type === "string",
  );
  if (
    types.some((type) =>
      ["SocialMediaPosting", "BlogPosting", "CreativeWork"].includes(type),
    )
  ) {
    return record;
  }

  for (const key of ["@graph", "mainEntity", "itemListElement"]) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = findJsonLdPosting(item);
        if (found) {
          return found;
        }
      }
    } else {
      const found = findJsonLdPosting(nested);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function extractJsonLd(document: Document): {
  text: string | null;
  author: string | null;
  datePublished: string | null;
  images: string[];
} {
  for (const script of Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    ),
  )) {
    try {
      const json = JSON.parse(script.textContent || "null") as unknown;
      const posting = findJsonLdPosting(json);
      if (!posting) {
        continue;
      }

      const authorRecord =
        posting.author && typeof posting.author === "object"
          ? (posting.author as Record<string, unknown>)
          : null;
      const images = arrayValue(posting.image)
        .map((image) =>
          typeof image === "object" && image
            ? stringValue((image as Record<string, unknown>).url)
            : stringValue(image),
        )
        .filter((image): image is string => !!image);

      return {
        text:
          stringValue(posting.articleBody) ||
          stringValue(posting.text) ||
          stringValue(posting.description) ||
          null,
        author:
          (authorRecord
            ? stringValue(authorRecord.name) ||
              stringValue(authorRecord.alternateName)
            : null) || null,
        datePublished: stringValue(posting.datePublished),
        images,
      };
    } catch {
      continue;
    }
  }

  return { text: null, author: null, datePublished: null, images: [] };
}

function buildTweetHtml({
  author,
  handle,
  tweetText,
  datePublished,
  imageList,
}: {
  author: string | null;
  handle: string;
  tweetText: string | null;
  datePublished: string | null;
  imageList: string[];
}) {
  const dom = new JSDOM("<article></article>");
  const { document } = dom.window;
  const article = document.querySelector("article")!;
  article.setAttribute("data-platform", X_ADAPTER_ID);

  const header = document.createElement("header");
  const byline = document.createElement("p");
  const displayName = document.createElement("strong");
  displayName.textContent = author || `@${handle}`;
  byline.append(displayName);
  if (handle) {
    byline.append(" ");
    const handleElement = document.createElement("span");
    handleElement.textContent = `@${handle}`;
    byline.append(handleElement);
  }
  header.append(byline);

  if (datePublished) {
    const time = document.createElement("time");
    time.setAttribute("datetime", datePublished);
    time.textContent = datePublished;
    header.append(time);
  }
  article.append(header);

  if (tweetText) {
    for (const line of tweetText.split(/\n{2,}/)) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line.trim();
      article.append(paragraph);
    }
  }

  for (const imageUrl of imageList) {
    const img = document.createElement("img");
    img.setAttribute("src", imageUrl);
    article.append(img);
  }

  return article.outerHTML;
}

export function parseXStatusHtml(html: string, url: string): ExtractedContent {
  const dom = new JSDOM(html, { url });
  const { document } = dom.window;
  const { handle, tweetId } = parseStatusPath(url);
  const jsonLd = extractJsonLd(document);
  const rawTitle =
    metaContent(document, 'meta[property="og:title"]') ||
    metaContent(document, 'meta[name="twitter:title"]') ||
    document.title.trim() ||
    null;
  const titleParts = extractTitleParts(rawTitle);
  const description =
    jsonLd.text ||
    metaContent(document, 'meta[property="og:description"]') ||
    metaContent(document, 'meta[name="twitter:description"]') ||
    titleParts.tweetText ||
    null;
  const author = jsonLd.author || titleParts.author || handle;
  const datePublished =
    jsonLd.datePublished ||
    metaContent(document, 'meta[property="article:published_time"]') ||
    dateFromTweetId(tweetId);
  const imageList = [
    ...new Set(
      [
        ...jsonLd.images,
        ...metaContents(document, 'meta[property="og:image"]'),
        ...metaContents(document, 'meta[name="twitter:image"]'),
        ...metaContents(document, 'meta[name="twitter:image:src"]'),
      ]
        .map((imageUrl) => absolutizeUrl(imageUrl, url))
        .filter((imageUrl): imageUrl is string => !!imageUrl),
    ),
  ];
  const tweetText = description || titleParts.tweetText;
  const title =
    tweetText && author
      ? `${author}: ${tweetText.slice(0, 80)}${tweetText.length > 80 ? "..." : ""}`
      : stripTrailingProductName(rawTitle || "") || null;

  if (!tweetText && !title) {
    throw new Error("X/Twitter status page did not contain tweet text");
  }

  return {
    title,
    description: tweetText,
    author,
    publisher: "X",
    datePublished,
    dateModified: null,
    coverImageUrl: imageList[0] || null,
    htmlContent: buildTweetHtml({
      author,
      handle,
      tweetText,
      datePublished,
      imageList,
    }),
    imageList,
    platform: X_ADAPTER_ID,
    rawExtraction: {
      tweetId,
      handle,
      source: jsonLd.text ? "json-ld" : "meta",
      imageList,
    },
    adapterVersion: X_ADAPTER_VERSION,
    statusCode: 200,
    url,
    imageReferer: X_IMAGE_REFERER,
  };
}

export const xAdapter: PlatformAdapter = {
  id: X_ADAPTER_ID,
  version: X_ADAPTER_VERSION,
  priority: 90,
  match(url: URL) {
    return X_HOSTS.has(url.hostname) && STATUS_PATH_PATTERN.test(url.pathname);
  },
  async extract({
    url,
    abortSignal,
    runProxy,
  }: AdapterExtractInput): Promise<ExtractedContent> {
    const response = await fetchWithProxy(
      url,
      {
        signal: abortSignal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Referer: X_IMAGE_REFERER,
        },
      },
      runProxy,
    );
    if (!response.ok) {
      throw new Error(`X/Twitter adapter fetch failed: ${response.status}`);
    }
    const html = await response.text();
    return {
      ...parseXStatusHtml(html, response.url || url),
      statusCode: response.status,
      url: response.url || url,
    };
  },
};
