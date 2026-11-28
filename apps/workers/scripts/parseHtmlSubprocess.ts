import { readFile } from "node:fs/promises";

import type { Rules } from "metascraper";
import metascraper from "metascraper";
import metascraperAuthor from "metascraper-author";
import metascraperDate from "metascraper-date";
import metascraperDescription from "metascraper-description";
import metascraperImage from "metascraper-image";
import metascraperPublisher from "metascraper-publisher";
import metascraperTitle from "metascraper-title";
import metascraperUrl from "metascraper-url";
import winston from "winston";

import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import metascraperSafeFavicon from "../metascraper-plugins/metascraper-safe-favicon";
import {
  createYoutubeDatePublishedRule,
  isAmazonHost,
  isRedditHost,
  isValidMetadataValue,
  isXHost,
  isYoutubeHost,
  normalizeMetadata,
} from "../workers/utils/html/htmlMetadata";
import { preprocessHtmlForMetadata } from "../workers/utils/html/htmlPreprocess";
import {
  parseSubprocessErrorSchema,
  parseSubprocessInputSchema,
  parseSubprocessOutputSchema,
} from "../workers/utils/html/parseHtmlSubprocessIpc";
import type { ReaderViewAssessment } from "../workers/utils/html/readerViewAssessment";

// Redirect all log output to stderr so it doesn't interfere with the JSON protocol on stdout.
logger.clear();
logger.add(new winston.transports.Stream({ stream: process.stderr }));

/**
 * Builds the metascraper rule list for `url`, loading domain-specific plugins
 * (and their heavy network/proxy dependencies) only when the URL matches.
 */
async function buildMetascraperParser(url: string) {
  const rules: Rules[] = [];

  if (isYoutubeHost(url)) {
    rules.push(createYoutubeDatePublishedRule());
  }

  rules.push(
    metascraperDate({
      dateModified: true,
      datePublished: true,
    }),
  );

  if (isAmazonHost(url)) {
    const [
      { default: metascraperAmazonImproved },
      { default: metascraperAmazon },
    ] = await Promise.all([
      import("../metascraper-plugins/metascraper-amazon-improved"),
      import("metascraper-amazon"),
    ]);
    rules.push(metascraperAmazonImproved(), metascraperAmazon());
  }

  if (isYoutubeHost(url)) {
    const { default: metascraperYoutube } = await import("metascraper-youtube");
    let httpAgent;
    let httpsAgent;
    if (serverConfig.proxy.httpProxy || serverConfig.proxy.httpsProxy) {
      const [{ HttpProxyAgent }, { HttpsProxyAgent }, { getRandomProxy }] =
        await Promise.all([
          import("http-proxy-agent"),
          import("https-proxy-agent"),
          import("../network"),
        ]);
      httpAgent = serverConfig.proxy.httpProxy
        ? new HttpProxyAgent(getRandomProxy(serverConfig.proxy.httpProxy))
        : undefined;
      httpsAgent = serverConfig.proxy.httpsProxy
        ? new HttpsProxyAgent(getRandomProxy(serverConfig.proxy.httpsProxy))
        : undefined;
    }
    rules.push(
      metascraperYoutube({
        gotOpts: {
          agent: {
            http: httpAgent,
            https: httpsAgent,
          },
        },
      }),
    );
  }

  if (isRedditHost(url)) {
    const { default: metascraperReddit } =
      await import("../metascraper-plugins/metascraper-reddit");
    rules.push(metascraperReddit());
  }

  rules.push(
    metascraperAuthor(),
    metascraperPublisher(),
    metascraperTitle(),
    metascraperDescription(),
  );

  if (isXHost(url)) {
    const { default: metascraperX } = await import("metascraper-x");
    rules.push(metascraperX());
  }

  rules.push(metascraperImage(), metascraperSafeFavicon(), metascraperUrl());

  return metascraper(rules);
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
  const [{ htmlContent, replacementCount, replacedBytes }, metascraperParser] =
    await Promise.all([
      readFile(htmlPath, "utf8").then((rawHtml) =>
        preprocessHtmlForMetadata(rawHtml),
      ),
      buildMetascraperParser(url),
    ]);
  if (replacementCount > 0) {
    logger.info(
      `[Crawler][${jobId}] Replaced ${replacementCount} embedded audio/video data URIs (${replacedBytes} bytes) before parsing.`,
    );
  }

  logger.info(
    `[Crawler][${jobId}] Will attempt to extract metadata from page ...`,
  );

  // Run metascraper
  const rawMeta = await metascraperParser({
    url,
    html: htmlContent,
    validateUrl: false,
    validate: isValidMetadataValue,
  });
  const meta = normalizeMetadata(rawMeta);

  logger.info(`[Crawler][${jobId}] Done extracting metadata from the page.`);

  let readableContent: { content: string } | null = null;
  let readerViewAssessment: ReaderViewAssessment | null = null;
  if (!metadataOnly) {
    // Loaded on demand: jsdom and Defuddle are slow to load, and metadata-only
    // runs don't need them.
    const { extractReadableContent, sanitizeProvidedContent } =
      await import("../workers/utils/html/readableContent");

    // Skip extraction if metascraper already provided readable content (e.g.
    // the Reddit plugin).
    if (meta.readableContentHtml) {
      ({ readableContent, readerViewAssessment } = sanitizeProvidedContent(
        meta.readableContentHtml,
        htmlContent,
        url,
        { alreadyPreprocessed: true },
      ));
    } else {
      logger.info(
        `[Crawler][${jobId}] Will attempt to extract readable content ...`,
      );
      ({ readableContent, readerViewAssessment } = extractReadableContent(
        meta.contentHtml ?? htmlContent,
        url,
        { alreadyPreprocessed: !meta.contentHtml },
      ));
      logger.info(`[Crawler][${jobId}] Done extracting readable content.`);
    }
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
