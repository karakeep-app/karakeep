import { readFile } from "node:fs/promises";

import DOMPurify from "dompurify";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { JSDOM } from "jsdom";
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
import { extractReadableContent } from "../workers/utils/readableContent";
import {
  assessReaderView,
  ReaderViewAssessment,
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
  const { htmlContent } = parserInput;

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
