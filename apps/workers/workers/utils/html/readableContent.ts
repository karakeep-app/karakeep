// Readable content extraction and sanitization for the HTML parsing subprocess.
// Kept apart from the subprocess script so that it can load this module (with
// linkedom, jsdom, and Defuddle, which are slow to load) only when it needs it.
import { Readability } from "@mozilla/readability";
import { DefuddleClass } from "defuddle/node";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { parseHTML } from "linkedom";

import { isAmazonHost, isFacebookHost, isThreadsHost } from "./htmlMetadata";
import { stripNonContentMarkupForDom } from "./htmlPreprocess";
import type { ReaderViewAssessment } from "./readerViewAssessment";
import {
  assessReaderView,
  unavailableReaderViewAssessment,
} from "./readerViewAssessment";

interface MutableDocumentShim {
  styleSheets?: unknown[];
  URL?: string;
  defaultView?: {
    getComputedStyle?: () => { display: string };
  } | null;
}

function attachDocumentUrls(
  document: Document,
  url: string,
  baseUri: string,
): void {
  const shim = document as unknown as MutableDocumentShim;
  shim.URL = url;
  Object.defineProperty(document, "documentURI", {
    value: url,
    configurable: true,
  });
  Object.defineProperty(document, "baseURI", {
    value: baseUri,
    configurable: true,
  });
}

/**
 * Parses HTML with linkedom (Defuddle's default Node DOM — significantly
 * faster and lighter than JSDOM on large pages) and applies the minimal DOM
 * shims expected by Defuddle and Readability.
 */
function parseSourceDocument(html: string, url: string): Document {
  let { document } = parseHTML(html);
  // Unlike JSDOM, linkedom doesn't synthesize `<html>`/`<body>` wrappers for
  // fragments or empty strings, and leaves omitted-`<body>` or post-`</body>`
  // content as direct children of `<html>` (which breaks Defuddle and causes
  // Readability's `BODY` ancestor walk to throw). Ensure we always have an
  // `<html>` root with every non-`<head>` child inside `<body>`.
  if (document.documentElement?.tagName !== "HTML") {
    const wrapped = /<body[\s>/]/i.test(html)
      ? `<!doctype html><html>${html}</html>`
      : `<!doctype html><html><head></head><body>${html}</body></html>`;
    ({ document } = parseHTML(wrapped));
  }
  const root = document.documentElement;
  if (root) {
    const existingContainer = Array.from(root.children).find(
      (el) => el.tagName === "BODY" || el.tagName === "FRAMESET",
    );
    if (!existingContainer || existingContainer.tagName === "BODY") {
      let body = existingContainer ?? null;
      const firstBodyChild = body?.firstChild ?? null;
      let seenBody = false;
      for (const child of Array.from(root.childNodes)) {
        if (child === body) {
          seenBody = true;
          continue;
        }
        if (child.nodeType === 1 && (child as Element).tagName === "HEAD") {
          continue;
        }
        if (body && child.nodeType === 3 && !(child.textContent ?? "").trim()) {
          continue;
        }
        if (!body) {
          body = document.createElement("body");
          root.appendChild(body);
        }
        if (!seenBody && firstBodyChild) {
          body.insertBefore(child, firstBodyChild);
        } else {
          body.appendChild(child);
        }
      }
      if (!body) {
        root.appendChild(document.createElement("body"));
      }
    }
  }

  const doc = document as unknown as Document;
  const shim = document as unknown as MutableDocumentShim;
  if (!shim.styleSheets) {
    shim.styleSheets = [];
  }
  if (shim.defaultView && !shim.defaultView.getComputedStyle) {
    shim.defaultView.getComputedStyle = () => ({ display: "" });
  }

  let baseUri = url;
  const baseHref = doc.querySelector("base[href]")?.getAttribute("href");
  if (baseHref) {
    try {
      baseUri = new URL(baseHref, url).href;
    } catch {
      // Ignore invalid <base href> values and keep the page URL.
    }
  }
  attachDocumentUrls(doc, url, baseUri);
  return doc;
}

/**
 * Many sites use custom data-* attributes for lazy loading images instead of the
 * standard `src` attribute (e.g. WeChat's data-src, data-actualsrc, data-srv, or
 * the common data-original / data-lazy patterns used by jQuery plugins).
 *
 * Defuddle and DOMPurify both operate on the DOM, so images with no `src` are
 * either ignored or their placeholders are stripped.  We normalise these attributes
 * to `src` *before* passing the document to Defuddle so that the extracted
 * article retains the actual image URLs.
 */
const LAZY_SRC_ATTRS = [
  "data-src",
  "data-actualsrc",
  "data-srv",
  "data-original",
  "data-lazy",
  "data-lazyload",
  "data-img-src",
  "data-url",
];

function isPlaceholderDataImage(src: string): boolean {
  // Tiny data-URI images are commonly used as lazy-load placeholders. Do not
  // treat every data:image/gif as a placeholder: SingleFile and some sites
  // inline real GIF assets as data URIs, and replacing those with a lazy
  // attribute URL makes the saved reader content depend on the remote image.
  // 200 chars is a deliberately generous cutoff: a 1x1 transparent GIF/PNG
  // placeholder is only ~60-100 chars, while a real inlined image is many KB,
  // so anything under this limit is safely a placeholder rather than an asset.
  const PLACEHOLDER_MAX_LENGTH = 200;
  const normalizedSrc = src.replace(/\s/g, "").toLowerCase();
  return (
    normalizedSrc.length <= PLACEHOLDER_MAX_LENGTH &&
    (normalizedSrc.startsWith("data:image/gif") ||
      normalizedSrc.startsWith("data:image/png"))
  );
}

function normalizeLazyLoadImages(document: Document): void {
  const images = document.querySelectorAll("img");
  for (const img of images) {
    // Only fill in src if it is absent or a known tiny placeholder. Real
    // inlined GIF/PNG data URIs must be preserved so archived content keeps
    // the saved image rather than falling back to a remote lazy-load URL.
    const currentSrc = img.getAttribute("src") ?? "";
    const needsSrc =
      !currentSrc || currentSrc === "#" || isPlaceholderDataImage(currentSrc);

    if (!needsSrc) {
      continue;
    }

    for (const attr of LAZY_SRC_ATTRS) {
      const value = img.getAttribute(attr);
      if (value && value.trim() && !value.startsWith("data:")) {
        img.setAttribute("src", value.trim());
        break;
      }
    }
  }
}

/**
 * Removes elements hidden by Amazon's `.aok-hidden` utility class (which
 * Defuddle's built-in hidden-element pass does not recognize and which often
 * wraps raw buybox JSON blobs that otherwise leak into reader view).
 */
function removeAmazonHiddenElements(document: Document): void {
  for (const el of document.querySelectorAll(".aok-hidden")) {
    if (
      el.tagName.toLowerCase() === "math" ||
      el.querySelector("math, [data-mathml], .katex-mathml")
    ) {
      continue;
    }
    el.remove();
  }
}

/**
 * Un-hides Facebook/Threads main content containers that Meta marks with
 * `aria-hidden="true"` when displaying a logged-out login/cookie modal, and
 * unwraps Facebook post `[role="dialog"]` containers that wrap `[role="article"]`
 * so Defuddle doesn't strip the post itself as a popup overlay.
 */
function unwrapMetaModalContainers(document: Document, url: string): void {
  const scrollview = document.querySelector('#scrollview[aria-hidden="true"]');
  if (scrollview) {
    scrollview.removeAttribute("aria-hidden");
  }
  if (!isFacebookHost(url)) {
    return;
  }
  for (const dialog of document.querySelectorAll('[role="dialog"]')) {
    if (dialog.querySelector('[role="article"]')) {
      dialog.removeAttribute("role");
      dialog.removeAttribute("aria-modal");
    } else if (
      dialog.querySelector('input[type="password"], form[action*="login"]')
    ) {
      dialog.remove();
    }
  }
}

/**
 * Extracts the main content with Defuddle. Its async extractors (YouTube
 * transcripts, Reddit/X/Bilibili APIs, ...) stay disabled: they make their own
 * HTTP requests, which would bypass the crawler's proxy settings. The sync
 * parse() never calls them; the throwing fetch is a backstop in case a future
 * version adds a network call to the sync path.
 *
 * Defuddle clones `document` internally and never mutates the caller's tree.
 */
function runDefuddle(document: Document, url: string): string | null {
  const result = new DefuddleClass(document, {
    url,
    useAsync: false,
    fetch: () => {
      throw new Error("Defuddle attempted a network request");
    },
  }).parse();
  return result.content || null;
}

function runReadability(document: Document, url: string): string | null {
  const clone = document.cloneNode(true) as Document;
  attachDocumentUrls(clone, url, document.baseURI || url);
  const result = new Readability(clone).parse();
  return typeof result?.content === "string" ? result.content : null;
}

/**
 * Whether sanitized extractor output has anything a reader would see. Defuddle
 * never reports "nothing found": it falls back to serializing an empty
 * `<body>`/`<main>`, and its cleanup can strip everything from very small
 * pages (e.g. it removes trailing headings, so a page that is just an `<h1>`
 * comes back empty).
 */
function hasVisibleContent(root: HTMLElement): boolean {
  return (
    !!root.textContent?.trim() ||
    !!root.querySelector("img, picture, video, audio, iframe, svg")
  );
}

export function extractReadableContent(
  htmlContent: string,
  url: string,
  opts?: { alreadyPreprocessed?: boolean },
): {
  readableContent: { content: string } | null;
  readerViewAssessment: ReaderViewAssessment;
} {
  const domHtml = opts?.alreadyPreprocessed
    ? htmlContent
    : stripNonContentMarkupForDom(htmlContent);
  const sourceDocument = parseSourceDocument(domHtml, url);
  // Keep JSDOM for DOMPurify sanitization so mXSS defenses rely on a full
  // HTML5 parser (only the smaller extracted article HTML passes through it).
  const purifyWindow = new JSDOM("").window;
  try {
    normalizeLazyLoadImages(sourceDocument);
    if (isAmazonHost(url)) {
      removeAmazonHiddenElements(sourceDocument);
    } else if (isFacebookHost(url) || isThreadsHost(url)) {
      unwrapMetaModalContainers(sourceDocument, url);
    }
    const purify = DOMPurify(purifyWindow);
    // Defuddle clones internally and leaves `sourceDocument` intact;
    // Readability mutates its input, so only the fallback clones the document.
    const extractors = [
      () => runDefuddle(sourceDocument, url),
      // Fallback for the rare pages where Defuddle extracts nothing.
      () => runReadability(sourceDocument, url),
    ];

    let purifiedHTML: string | null = null;
    for (const extract of extractors) {
      const content = extract();
      if (content === null) {
        continue;
      }
      const sanitized = purify.sanitize(content);
      purifyWindow.document.body.innerHTML = sanitized;
      if (hasVisibleContent(purifyWindow.document.body)) {
        purifiedHTML = sanitized;
        break;
      }
    }

    if (purifiedHTML === null) {
      return {
        readableContent: null,
        readerViewAssessment: unavailableReaderViewAssessment(),
      };
    }

    return {
      readableContent: { content: purifiedHTML },
      readerViewAssessment: assessReaderView(
        sourceDocument,
        purifyWindow.document,
        url,
      ),
    };
  } finally {
    purifyWindow.close();
  }
}

/**
 * Sanitizes readable content that a metascraper plugin provided (e.g. the
 * Reddit plugin), so that it goes through DOMPurify like extracted content.
 */
export function sanitizeProvidedContent(
  contentHtml: string,
  sourceHtml: string,
  url: string,
  opts?: { alreadyPreprocessed?: boolean },
): {
  readableContent: { content: string };
  readerViewAssessment: ReaderViewAssessment;
} {
  const purifyWindow = new JSDOM("").window;
  try {
    const purifiedHTML = DOMPurify(purifyWindow).sanitize(contentHtml);
    purifyWindow.document.body.innerHTML = purifiedHTML;
    const domHtml = opts?.alreadyPreprocessed
      ? sourceHtml
      : stripNonContentMarkupForDom(sourceHtml);
    const sourceDocument = parseSourceDocument(domHtml, url);
    return {
      readableContent: { content: purifiedHTML },
      readerViewAssessment: assessReaderView(
        sourceDocument,
        purifyWindow.document,
        url,
      ),
    };
  } finally {
    purifyWindow.close();
  }
}
