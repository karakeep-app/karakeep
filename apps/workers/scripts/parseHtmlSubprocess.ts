import { readFile } from "node:fs/promises";

import { Readability } from "@mozilla/readability";
import { DefuddleClass } from "defuddle/node";
import DOMPurify from "dompurify";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { JSDOM, VirtualConsole } from "jsdom";
import metascraper from "metascraper";
import metascraperAmazon from "metascraper-amazon";
import metascraperAuthor from "metascraper-author";
import metascraperDate from "metascraper-date";
import metascraperDescription from "metascraper-description";
import metascraperImage from "metascraper-image";
import metascraperPublisher from "metascraper-publisher";
import metascraperTitle from "metascraper-title";
import metascraperUrl from "metascraper-url";
import metascraperX from "metascraper-x";
import metascraperYoutube from "metascraper-youtube";
import winston from "winston";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import metascraperAmazonImproved from "../metascraper-plugins/metascraper-amazon-improved";
import metascraperReddit from "../metascraper-plugins/metascraper-reddit";
import metascraperSafeFavicon from "../metascraper-plugins/metascraper-safe-favicon";
import { getRandomProxy } from "../network";
import {
  parseSubprocessErrorSchema,
  parseSubprocessInputSchema,
  parseSubprocessOutputSchema,
} from "../workers/utils/parseHtmlSubprocessIpc";
import { stashInlineImages } from "../workers/utils/inlineImages";
import {
  assessReaderView,
  ReaderViewAssessment,
  unavailableReaderViewAssessment,
} from "../workers/utils/readerViewAssessment";

// Redirect all log output to stderr so it doesn't interfere with the JSON protocol on stdout.
logger.clear();
logger.add(new winston.transports.Stream({ stream: process.stderr }));

const metascraperParser = metascraper([
  metascraperDate({
    dateModified: true,
    datePublished: true,
  }),
  metascraperAmazonImproved(),
  metascraperAmazon(),
  metascraperYoutube({
    gotOpts: {
      agent: {
        http: serverConfig.proxy.httpProxy
          ? new HttpProxyAgent(getRandomProxy(serverConfig.proxy.httpProxy))
          : undefined,
        https: serverConfig.proxy.httpsProxy
          ? new HttpsProxyAgent(getRandomProxy(serverConfig.proxy.httpsProxy))
          : undefined,
      },
    },
  }),
  metascraperReddit(),
  metascraperAuthor(),
  metascraperPublisher(),
  metascraperTitle(),
  metascraperDescription(),
  metascraperX(),
  metascraperImage(),
  metascraperSafeFavicon(),
  metascraperUrl(),
]);

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

function extractReadableContent(
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

const EMBEDDED_MEDIA_DATA_URI_PATTERN = /data:(?:audio|video)\/[^"'\s<>)]*/gi;

/**
 * Full-page archives can contain large audio and video files embedded directly
 * in src attributes. Those payloads are useful in the stored archive, but they
 * are irrelevant to metadata and readable-content extraction and cause large
 * memory amplification when parsed into a DOM.
 *
 * Replace them only in the parser's in-memory copy. The original HTML file
 * remains untouched for full-page archival.
 */
function replaceEmbeddedMediaDataUris(htmlContent: string): {
  htmlContent: string;
  replacedBytes: number;
  replacementCount: number;
} {
  let replacedBytes = 0;
  let replacementCount = 0;
  const parserHtmlContent = htmlContent.replace(
    EMBEDDED_MEDIA_DATA_URI_PATTERN,
    (dataUri) => {
      replacedBytes += dataUri.length;
      replacementCount += 1;
      return "about:blank";
    },
  );

  return {
    htmlContent: parserHtmlContent,
    replacedBytes,
    replacementCount,
  };
}

async function main() {
  // Read all of stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = parseSubprocessInputSchema.parse(
    JSON.parse(Buffer.concat(chunks).toString()),
  );
  const { htmlPath, url, jobId, metadataOnly } = input;
  const parserInput = replaceEmbeddedMediaDataUris(
    await readFile(htmlPath, "utf8"),
  );
  if (parserInput.replacementCount > 0) {
    logger.info(
      `[Crawler][${jobId}] Replaced ${parserInput.replacementCount} embedded audio/video data URIs (${parserInput.replacedBytes} bytes) before parsing.`,
    );
  }
  const inlineImages = stashInlineImages(parserInput.htmlContent);
  if (inlineImages.count > 0) {
    logger.info(
      `[Crawler][${jobId}] Set aside ${inlineImages.count} inline images (${inlineImages.bytes} bytes) while parsing.`,
    );
  }
  const { htmlContent } = inlineImages;

  logger.info(
    `[Crawler][${jobId}] Will attempt to extract metadata from page ...`,
  );

  // Run metascraper
  const meta = await metascraperParser({
    url,
    html: htmlContent,
    validateUrl: false,
  });

  logger.info(`[Crawler][${jobId}] Done extracting metadata from the page.`);

  // Conditionally run Defuddle (skip if metascraper already provided readable content, e.g. Reddit plugin)
  let readableContent: { content: string } | null = null;
  let readerViewAssessment: ReaderViewAssessment | null = null;
  if (!metadataOnly && meta.readableContentHtml) {
    // Sanitize plugin-provided HTML through DOMPurify (the extractReadableContent
    // path already does this, but the direct-content path was missing it).
    const purifyWindow = new JSDOM("").window;
    try {
      const purify = DOMPurify(purifyWindow);
      const purifiedHTML = purify.sanitize(meta.readableContentHtml);
      readableContent = { content: purifiedHTML };
      const sourceDom = new JSDOM(htmlContent, { url });
      const extractedDom = new JSDOM(purifiedHTML, { url });
      try {
        readerViewAssessment = assessReaderView(
          sourceDom.window.document,
          extractedDom.window.document,
          url,
        );
      } finally {
        sourceDom.window.close();
        extractedDom.window.close();
      }
    } finally {
      purifyWindow.close();
    }
  }

  if (!metadataOnly && !readableContent) {
    logger.info(
      `[Crawler][${jobId}] Will attempt to extract readable content ...`,
    );
    const extractionResult = extractReadableContent(
      meta.contentHtml ?? htmlContent,
      url,
    );
    readableContent = extractionResult.readableContent;
    readerViewAssessment = extractionResult.readerViewAssessment;
    logger.info(`[Crawler][${jobId}] Done extracting readable content.`);
  }

  const output = parseSubprocessOutputSchema.parse({
    metadata: meta,
    readableContent,
    readerViewAssessment,
  });

  // Write the result as JSON to stdout, with the inline images put back into
  // the readable content (and wherever else a placeholder ended up).
  process.stdout.write(inlineImages.restore(JSON.stringify(output)));
}

main().catch(async (err: unknown) => {
  const errorOutput = parseSubprocessErrorSchema.parse({
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  const json = JSON.stringify(errorOutput);
  if (!process.stdout.write(json)) {
    await new Promise<void>((resolve) => process.stdout.once("drain", resolve));
  }

  process.exitCode = 1;
});
