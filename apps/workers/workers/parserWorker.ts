import { parentPort } from "worker_threads";
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

import serverConfig from "@karakeep/shared/config";

import metascraperReddit from "../metascraper-plugins/metascraper-reddit";

const metascraperParser = metascraper([
  metascraperDate({
    dateModified: true,
    datePublished: true,
  }),
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

interface ParseRequest {
  type: "parse";
  htmlContent: string;
  url: string;
  jobId: string;
}

interface ParseResponse {
  meta: {
    title?: string;
    description?: string;
    image?: string;
    logo?: string;
    author?: string;
    publisher?: string;
    datePublished?: string;
    dateModified?: string;
  };
  readableContent: {
    content: string;
  } | null;
}

async function extractMetadata(htmlContent: string, url: string) {
  const meta = await metascraperParser({
    url,
    html: htmlContent,
    // We don't want to validate the URL again as we've already done it by visiting the page.
    // This was added because URL validation fails if the URL ends with a question mark (e.g. empty query params).
    validateUrl: false,
  });
  return meta;
}

function extractReadableContent(htmlContent: string, url: string) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(htmlContent, { url, virtualConsole });
  let result: { content: string } | null = null;
  try {
    const readableContent = new Readability(dom.window.document).parse();
    if (!readableContent || typeof readableContent.content !== "string") {
      return null;
    }

    const purifyWindow = new JSDOM("").window;
    try {
      const purify = DOMPurify(purifyWindow);
      const purifiedHTML = purify.sanitize(readableContent.content);

      result = {
        content: purifiedHTML,
      };
    } finally {
      purifyWindow.close();
    }
  } finally {
    dom.window.close();
  }

  return result;
}

async function handleParseRequest(
  request: ParseRequest,
): Promise<ParseResponse> {
  const { htmlContent, url } = request;

  const [meta, readableContent] = await Promise.all([
    extractMetadata(htmlContent, url),
    Promise.resolve(extractReadableContent(htmlContent, url)),
  ]);

  return {
    meta,
    readableContent,
  };
}

// Worker thread message handler
if (parentPort) {
  parentPort.on("message", async (request: ParseRequest) => {
    try {
      const response = await handleParseRequest(request);
      parentPort!.postMessage({ success: true, data: response });
    } catch (error) {
      parentPort!.postMessage({
        success: false,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    }
  });
}
