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

import metascraperAmazonImproved from "../metascraper-plugins/metascraper-amazon-improved";
import metascraperReddit from "../metascraper-plugins/metascraper-reddit";
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

function extractReadableContent(
  htmlContent: string,
  url: string,
): { content: string } | null {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(htmlContent, { url, virtualConsole });
  try {
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

  // Conditionally run readability (skip if metascraper already provided readable content, e.g. Reddit plugin)
  let readableContent: { content: string } | null = null;
  if (meta.readableContentHtml) {
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
