// Readable content extraction and sanitization for the HTML parsing subprocess.
// Kept apart from the subprocess script so that it can load this module (with
// jsdom and Defuddle, which are slow to load) only when it needs it.
import { Readability } from "@mozilla/readability";
import { DefuddleClass } from "defuddle/node";
import DOMPurify from "dompurify";
import { JSDOM, VirtualConsole } from "jsdom";

import { isAmazonHost } from "./htmlMetadata";
import { stripNonContentMarkupForDom } from "./htmlPreprocess";
import type { ReaderViewAssessment } from "./readerViewAssessment";
import {
  assessReaderView,
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
function hasVisibleContent(root: HTMLElement): boolean {
  return (
    !!root.textContent?.trim() ||
    !!root.querySelector("img, picture, video, audio, iframe, svg")
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
  const dom = new JSDOM(stripNonContentMarkupForDom(htmlContent), {
    url,
    virtualConsole,
  });
  const purifyWindow = new JSDOM("").window;
  try {
    normalizeLazyLoadImages(dom.window.document);
    if (isAmazonHost(url)) {
      removeAmazonHiddenElements(dom.window.document);
    }
    const purify = DOMPurify(purifyWindow);
    // Defuddle clones internally and leaves `dom.window.document` intact;
    // Readability mutates its input, so only the fallback clones the document.
    const extractors = [
      () => runDefuddle(dom.window.document, url),
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
        dom.window.document,
        purifyWindow.document,
        url,
      ),
    };
  } finally {
    purifyWindow.close();
    dom.window.close();
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
): {
  readableContent: { content: string };
  readerViewAssessment: ReaderViewAssessment;
} {
  const virtualConsole = new VirtualConsole();
  const purifyWindow = new JSDOM("").window;
  try {
    const purifiedHTML = DOMPurify(purifyWindow).sanitize(contentHtml);
    purifyWindow.document.body.innerHTML = purifiedHTML;
    const sourceDom = new JSDOM(stripNonContentMarkupForDom(sourceHtml), {
      url,
      virtualConsole,
    });
    try {
      return {
        readableContent: { content: purifiedHTML },
        readerViewAssessment: assessReaderView(
          sourceDom.window.document,
          purifyWindow.document,
          url,
        ),
      };
    } finally {
      sourceDom.window.close();
    }
  } finally {
    purifyWindow.close();
  }
}
