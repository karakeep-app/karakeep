import { Readability } from "@mozilla/readability";
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
import metascraperLogo from "metascraper-logo-favicon";
import metascraperPublisher from "metascraper-publisher";
import metascraperTitle from "metascraper-title";
import metascraperUrl from "metascraper-url";
import metascraperX from "metascraper-x";
import metascraperYoutube from "metascraper-youtube";
import { getRandomProxy } from "network";
import winston from "winston";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import { load as cheerioLoad } from "cheerio";

import metascraperAmazonImproved from "../metascraper-plugins/metascraper-amazon-improved";
import metascraperReddit from "../metascraper-plugins/metascraper-reddit";
import metascraperTwitter, {
  __private as twitterPrivate,
} from "../metascraper-plugins/metascraper-twitter";
import {
  parseSubprocessErrorSchema,
  parseSubprocessInputSchema,
  parseSubprocessOutputSchema,
} from "../workers/utils/parseHtmlSubprocessIpc";

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
  metascraperTwitter(),
  metascraperAuthor(),
  metascraperPublisher(),
  metascraperTitle(),
  metascraperDescription(),
  metascraperX(),
  metascraperImage(),
  metascraperLogo({
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
  metascraperUrl(),
]);

/**
 * Many sites use custom data-* attributes for lazy loading images instead of the
 * standard `src` attribute (e.g. WeChat's data-src, data-actualsrc, data-srv, or
 * the common data-original / data-lazy patterns used by jQuery plugins).
 *
 * Readability and DOMPurify both operate on the DOM, so images with no `src` are
 * either ignored or their placeholders are stripped.  We normalise these attributes
 * to `src` *before* passing the document to Readability so that the extracted
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

function normalizeLazyLoadImages(document: Document): void {
  const images = document.querySelectorAll("img");
  for (const img of images) {
    // Only fill in src if it is absent or a known placeholder (blank / data:)
    const currentSrc = img.getAttribute("src") ?? "";
    const needsSrc =
      !currentSrc ||
      currentSrc === "#" ||
      currentSrc.startsWith("data:image/gif") ||
      currentSrc.startsWith("data:image/png");

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

function extractReadableContent(
  htmlContent: string,
  url: string,
): { content: string } | null {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(htmlContent, { url, virtualConsole });
  try {
    normalizeLazyLoadImages(dom.window.document);
    const readableContent = new Readability(dom.window.document).parse();
    if (!readableContent || typeof readableContent.content !== "string") {
      return null;
    }

    const purifyWindow = new JSDOM("").window;
    try {
      const purify = DOMPurify(purifyWindow);
      const purifiedHTML = purify.sanitize(readableContent.content);
      return { content: purifiedHTML };
    } finally {
      purifyWindow.close();
    }
  } finally {
    dom.window.close();
  }
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
  const { htmlContent, url, jobId } = input;

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

  // Check for X/Twitter article content using our custom extraction.
  // metascraper doesn't support custom fields like readableContentHtml,
  // so we call the extraction functions directly here.
  let readableContent: { content: string } | null = null;
  {
    let isXUrl = false;
    try {
      const hostname = new URL(url).hostname
        .replace(/^www\./, "")
        .toLowerCase();
      isXUrl = hostname === "x.com" || hostname === "twitter.com";
    } catch {}
    if (isXUrl) {
      const htmlDom = cheerioLoad(htmlContent);
      const articleContent = twitterPrivate.extractArticleWithReplies(
        htmlDom,
        url,
      );
      // For articles, also extract reply tweets via DOM extraction
      // and append only the replies section (after <h3>Replies</h3>)
      // to avoid duplicating the main tweet content.
      const domContent = twitterPrivate.extractFromDom(htmlDom, url);
      let repliesOnly: string | undefined;
      if (articleContent && domContent) {
        const repliesIdx = domContent.indexOf("<h3>Replies</h3>");
        if (repliesIdx >= 0) {
          repliesOnly = domContent.slice(repliesIdx);
        }
      }

      const combined = articleContent
        ? articleContent + (repliesOnly ? `\n<hr />\n${repliesOnly}` : "")
        : domContent;

      if (combined) {
        const purifyWindow = new JSDOM("").window;
        try {
          const purify = DOMPurify(purifyWindow);
          const purifiedHTML = purify.sanitize(combined);
          readableContent = { content: purifiedHTML };
          logger.info(
            `[Crawler][${jobId}] Used X ${articleContent ? "article" : "DOM"} extraction (${purifiedHTML.length} bytes)`,
          );
        } finally {
          purifyWindow.close();
        }
      }
    }
  }

  // Fallback to plugin-provided readableContentHtml when a metascraper plugin
  // can provide lighter-weight extracted HTML, such as the X/Twitter
  // unauthenticated meta-tag fallback.
  if (!readableContent && meta.readableContentHtml) {
    // Sanitize plugin-provided HTML through DOMPurify (the extractReadableContent
    // path already does this, but the direct-content path was missing it).
    const purifyWindow = new JSDOM("").window;
    try {
      const purify = DOMPurify(purifyWindow);
      const purifiedHTML = purify.sanitize(meta.readableContentHtml);
      readableContent = { content: purifiedHTML };
    } finally {
      purifyWindow.close();
    }
  }

  if (!readableContent) {
    logger.info(
      `[Crawler][${jobId}] Will attempt to extract readable content ...`,
    );
    readableContent = extractReadableContent(
      meta.contentHtml ?? htmlContent,
      url,
    );
    logger.info(`[Crawler][${jobId}] Done extracting readable content.`);
  }

  const output = parseSubprocessOutputSchema.parse({
    metadata: meta,
    readableContent,
  });

  // Write the result as JSON to stdout
  process.stdout.write(JSON.stringify(output));
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
