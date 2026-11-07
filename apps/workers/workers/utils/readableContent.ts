import { Readability } from "@mozilla/readability";
import { DefuddleClass } from "defuddle/node";
import DOMPurify from "dompurify";
import { JSDOM, VirtualConsole } from "jsdom";

import {
  assessReaderView,
  ReaderViewAssessment,
  unavailableReaderViewAssessment,
} from "./readerViewAssessment";

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
 * Extracts the main content with Defuddle. Its async extractors (YouTube
 * transcripts, Reddit/X/Bilibili APIs, ...) stay disabled: they make their own
 * HTTP requests, which would bypass the crawler's proxy settings. The sync
 * parse() never calls them; the throwing fetch is a backstop in case a future
 * version adds a network call to the sync path.
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

function runReadability(document: Document): string | null {
  const result = new Readability(document).parse();
  return typeof result?.content === "string" ? result.content : null;
}

/**
 * Whether sanitized extractor output has anything a reader would see. Defuddle
 * never reports "nothing found": it falls back to serializing an empty
 * `<body>`/`<main>`, and its cleanup can strip everything from very small
 * pages (e.g. it removes trailing headings, so a page that is just an `<h1>`
 * comes back empty).
 */
function hasVisibleContent(sanitizedHtml: string, document: Document): boolean {
  const container = document.createElement("div");
  container.innerHTML = sanitizedHtml;
  return (
    !!container.textContent?.trim() ||
    !!container.querySelector("img, picture, video, audio, iframe, svg")
  );
}

export function extractReadableContent(
  htmlContent: string,
  url: string,
): {
  readableContent: { content: string } | null;
  readerViewAssessment: ReaderViewAssessment;
} {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(htmlContent, { url, virtualConsole });
  const purifyWindow = new JSDOM("").window;
  try {
    normalizeLazyLoadImages(dom.window.document);
    const purify = DOMPurify(purifyWindow);
    // Both extractors mutate the document they're given, so each gets a clone.
    const extractors = [
      () => runDefuddle(dom.window.document.cloneNode(true) as Document, url),
      // Fallback for the rare pages where Defuddle extracts nothing.
      () => runReadability(dom.window.document.cloneNode(true) as Document),
    ];

    let purifiedHTML: string | null = null;
    for (const extract of extractors) {
      const content = extract();
      if (content === null) {
        continue;
      }
      const sanitized = purify.sanitize(content);
      if (hasVisibleContent(sanitized, purifyWindow.document)) {
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

    const extractedDom = new JSDOM(purifiedHTML, { url, virtualConsole });
    try {
      return {
        readableContent: { content: purifiedHTML },
        readerViewAssessment: assessReaderView(
          dom.window.document,
          extractedDom.window.document,
          url,
        ),
      };
    } finally {
      extractedDom.window.close();
    }
  } finally {
    purifyWindow.close();
    dom.window.close();
  }
}
