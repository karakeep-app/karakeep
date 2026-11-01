import { fetch } from "expo/fetch";
import { DomUtils, parseDocument } from "htmlparser2";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ARTICLE_IMAGE_BYTES = 20 * 1024 * 1024;
// Every <img> showing an image gets its own copy of the data URL, so an image
// repeated many times can blow past the download budget once embedded. Room
// for the whole budget once, base64-encoded.
const MAX_EMBEDDED_LENGTH = 32 * 1024 * 1024;
const IMAGE_TIMEOUT = 20_000;
const CONCURRENCY = 4;
const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

type HtmlElement = ReturnType<typeof DomUtils.getElementsByTagName>[number];

interface HttpUrl {
  origin: string;
  path: string;
  query: string;
}

const HTTP_URL = /^(https?):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i;
const HAS_SCHEME = /^[a-z][a-z\d+\-.]*:/i;

// React Native's URL polyfill neither resolves relative URLs nor normalizes
// paths, so http(s) URLs are handled by hand.
function parseHttpUrl(value: string): HttpUrl | undefined {
  const match = HTTP_URL.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const scheme = match[1].toLowerCase();
  const authority = match[2];
  const hostPort = authority
    .slice(authority.lastIndexOf("@") + 1)
    .toLowerCase();
  if (!hostPort) {
    return undefined;
  }
  const defaultPort = scheme === "https" ? ":443" : ":80";
  const host = hostPort.endsWith(defaultPort)
    ? hostPort.slice(0, -defaultPort.length)
    : hostPort;
  return {
    origin: `${scheme}://${host}`,
    path: normalizePath(match[3] || "/"),
    query: match[4] ?? "",
  };
}

// Expects an absolute path; resolves "." and ".." the way browsers do.
function normalizePath(path: string) {
  const segments = path.split("/").slice(1);
  const output: string[] = [];
  for (const segment of segments) {
    if (segment === "..") {
      output.pop();
    } else if (segment !== ".") {
      output.push(segment);
    }
  }
  const last = segments[segments.length - 1];
  if (last === "." || last === "..") {
    output.push("");
  }
  return `/${output.join("/")}`;
}

function formatHttpUrl(url: HttpUrl) {
  return `${url.origin}${url.path}${url.query}`;
}

export function resolveImageUrl(
  raw: string,
  baseUrl: string | undefined,
): string | undefined {
  const value = raw.trim();
  if (!value || value.startsWith("#")) {
    return undefined;
  }
  if (HAS_SCHEME.test(value)) {
    const absolute = parseHttpUrl(value);
    return absolute ? formatHttpUrl(absolute) : undefined;
  }

  const base = baseUrl ? parseHttpUrl(baseUrl) : undefined;
  if (!base) {
    return undefined;
  }
  if (value.startsWith("//")) {
    const scheme = base.origin.slice(0, base.origin.indexOf(":"));
    return resolveImageUrl(`${scheme}:${value}`, undefined);
  }

  const queryStart = value.indexOf("?");
  const pathPart = queryStart === -1 ? value : value.slice(0, queryStart);
  const query = queryStart === -1 ? "" : value.slice(queryStart);
  const path = pathPart.startsWith("/")
    ? pathPart
    : pathPart === ""
      ? base.path
      : `${base.path.slice(0, base.path.lastIndexOf("/") + 1)}${pathPart}`;
  return formatHttpUrl({
    ...base,
    path: normalizePath(path),
    query: pathPart === "" && !query ? base.query : query,
  });
}

function toBase64(bytes: Uint8Array) {
  const CHUNK = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

function concatChunks(chunks: Uint8Array[], length: number) {
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

class ImageTooLargeError extends Error {}

// Bytes transferred for the article so far, kept or not: rejected and broken
// downloads cost bandwidth too.
interface ImageBudget {
  used: number;
}

async function readBody(
  response: Awaited<ReturnType<typeof fetch>>,
  budget: ImageBudget,
) {
  const chunks: Uint8Array[] = [];
  let received = 0;
  const take = (chunk: Uint8Array) => {
    received += chunk.length;
    budget.used += chunk.length;
    if (received > MAX_IMAGE_BYTES || budget.used > MAX_ARTICLE_IMAGE_BYTES) {
      throw new ImageTooLargeError();
    }
    chunks.push(chunk);
  };

  const reader = response.body?.getReader();
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        take(value);
      }
    } catch (error) {
      reader.cancel().catch(() => undefined);
      throw error;
    }
  } else {
    take(new Uint8Array(await response.arrayBuffer()));
  }
  return concatChunks(chunks, received);
}

// Images are fetched without credentials: reader content only links images
// on other sites, never the server's own assets.
export interface InlineImagesOptions {
  articleUrl?: string;
  signal?: AbortSignal;
}

async function downloadImage(
  url: string,
  options: InlineImagesOptions,
  budget: ImageBudget,
): Promise<string | undefined> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, IMAGE_TIMEOUT);
  options.signal?.addEventListener("abort", abort);
  // The listener doesn't hear an abort that already happened.
  if (options.signal?.aborted) {
    abort();
  }
  try {
    const response = await fetch(url, {
      // Expo's fetch sends the device's cookies unless told not to.
      credentials: "omit",
      signal: controller.signal,
    });
    if (!response.ok) {
      return undefined;
    }

    const type = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!ACCEPTED_TYPES.has(type)) {
      return undefined;
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (
      declaredLength > MAX_IMAGE_BYTES ||
      budget.used + declaredLength > MAX_ARTICLE_IMAGE_BYTES
    ) {
      return undefined;
    }

    const bytes = await readBody(response, budget);
    return `data:${type};base64,${toBase64(bytes)}`;
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }
    return undefined;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
    // Stops a response turned down before its body was read (too big, not an
    // image) from downloading on regardless. A no-op once the body was read.
    controller.abort();
  }
}

// A candidate's URL runs to the first whitespace and may contain commas; one
// without a descriptor ends with the comma that separates it from the next.
function firstSrcsetUrl(srcset: string | undefined) {
  return srcset?.trim().split(/\s+/)[0]?.replace(/,$/, "") || undefined;
}

// A data: src is kept as is: the server already swaps lazy-loading
// placeholders for the real URL, so one left here is a real image.
function imageSource(element: HtmlElement) {
  const own =
    element.attribs.src?.trim() ||
    element.attribs["data-src"]?.trim() ||
    firstSrcsetUrl(element.attribs.srcset);
  if (own) {
    return own;
  }
  // A <picture> fallback <img> may leave every URL to its <source>s.
  const parent = element.parent;
  if (parent && "name" in parent && parent.name === "picture") {
    for (const source of DomUtils.getElementsByTagName(
      "source",
      parent.children,
      false,
    )) {
      const url = firstSrcsetUrl(source.attribs.srcset);
      if (url) {
        return url;
      }
    }
  }
  return undefined;
}

/**
 * Downloads the article's images and embeds them as data URLs, so the stored
 * copy renders without a connection. Images that can't be fetched keep their
 * original URL.
 */
export async function inlineArticleImages(
  html: string,
  options: InlineImagesOptions,
): Promise<string> {
  const document = parseDocument(html, {
    withStartIndices: true,
    withEndIndices: true,
  });
  const targets = new Map<string, HtmlElement[]>();
  for (const image of DomUtils.getElementsByTagName("img", document, true)) {
    const source = imageSource(image);
    if (!source || source.startsWith("data:")) {
      continue;
    }
    const url = resolveImageUrl(source, options.articleUrl);
    if (url) {
      targets.set(url, [...(targets.get(url) ?? []), image]);
    }
  }
  if (targets.size === 0) {
    return html;
  }

  const budget: ImageBudget = { used: 0 };
  const downloaded = new Map<string, string>();
  const queue = [...targets.keys()];
  const worker = async () => {
    // Once the article's budget is spent, the rest would only be turned down.
    while (budget.used < MAX_ARTICLE_IMAGE_BYTES) {
      const url = queue.shift();
      if (url === undefined) {
        return;
      }
      const dataUrl = await downloadImage(url, options, budget);
      if (dataUrl) {
        downloaded.set(url, dataUrl);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
  );

  const changed = new Set<HtmlElement>();
  let embeddedLength = 0;
  for (const [url, images] of targets) {
    const dataUrl = downloaded.get(url);
    if (!dataUrl) {
      continue;
    }
    for (const image of images) {
      if (embeddedLength + dataUrl.length > MAX_EMBEDDED_LENGTH) {
        continue;
      }
      embeddedLength += dataUrl.length;
      image.attribs.src = dataUrl;
      delete image.attribs.srcset;
      delete image.attribs.sizes;
      delete image.attribs["data-src"];
      image.attribs.loading = "eager";
      changed.add(image);

      // A <source> would otherwise win over the embedded image.
      const parent = image.parent;
      if (parent && "name" in parent && parent.name === "picture") {
        for (const source of DomUtils.getElementsByTagName(
          "source",
          parent.children,
          false,
        )) {
          if (source.attribs.srcset !== undefined) {
            delete source.attribs.srcset;
            changed.add(source);
          }
        }
      }
    }
  }

  // Splice only the rewritten tags, leaving the rest of the markup untouched.
  // Built in one pass: rebuilding the string per tag would copy the whole
  // article, embedded images included, once per tag.
  const parts: string[] = [];
  let position = 0;
  const edits = [...changed].sort(
    (left, right) => (left.startIndex ?? 0) - (right.startIndex ?? 0),
  );
  for (const element of edits) {
    if (element.startIndex === null || element.endIndex === null) {
      continue;
    }
    parts.push(
      html.slice(position, element.startIndex),
      DomUtils.getOuterHTML(element, { encodeEntities: "utf8" }),
    );
    position = element.endIndex + 1;
  }
  parts.push(html.slice(position));
  return parts.join("");
}

/**
 * The bookmark as it should be stored offline: reader HTML with its images
 * embedded. Throws if a link has no reader content yet.
 */
export async function inlineBookmarkImages(
  bookmark: ZBookmark,
  options: Omit<InlineImagesOptions, "articleUrl"> = {},
): Promise<ZBookmark> {
  const { content } = bookmark;
  if (content.type !== BookmarkTypes.LINK) {
    return bookmark;
  }
  if (typeof content.htmlContent !== "string") {
    throw new Error("Reader content is not ready yet.");
  }
  const htmlContent = await inlineArticleImages(content.htmlContent, {
    ...options,
    articleUrl: content.url,
  });
  return { ...bookmark, content: { ...content, htmlContent } };
}
