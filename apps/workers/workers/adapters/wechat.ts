import { JSDOM } from "jsdom";
import { fetchWithProxy } from "network";

import type {
  AdapterExtractInput,
  ExtractedContent,
  PlatformAdapter,
} from "./types";

export const WECHAT_ADAPTER_ID = "wechat";
export const WECHAT_ADAPTER_VERSION = "2026-05-07";
export const WECHAT_IMAGE_REFERER = "https://mp.weixin.qq.com/";

function textContent(document: Document, selector: string): string | null {
  return document.querySelector(selector)?.textContent?.trim() || null;
}

function metaContent(document: Document, selector: string): string | null {
  return (
    document.querySelector<HTMLMetaElement>(selector)?.content?.trim() || null
  );
}

function absolutizeUrl(url: string | null | undefined, baseUrl: string) {
  if (!url) {
    return null;
  }
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("data:")) {
    return null;
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractScriptString(html: string, variableName: string) {
  const pattern = new RegExp(
    String.raw`\b${variableName}\s*=\s*(['"])(.*?)\1`,
    "s",
  );
  return html.match(pattern)?.[2]?.trim() || null;
}

function cleanContentElement(
  contentElement: Element,
  baseUrl: string,
): { htmlContent: string; imageList: string[] } {
  const clone = contentElement.cloneNode(true) as Element;

  for (const element of Array.from(
    clone.querySelectorAll("script, style, link, iframe"),
  )) {
    element.remove();
  }

  const imageList: string[] = [];
  for (const img of Array.from(clone.querySelectorAll("img"))) {
    const source =
      img.getAttribute("data-src") ||
      img.getAttribute("src") ||
      img.getAttribute("data-original") ||
      img.getAttribute("data-backsrc");
    const imageUrl = absolutizeUrl(source, baseUrl);
    if (!imageUrl) {
      continue;
    }
    imageList.push(imageUrl);
    img.setAttribute("src", imageUrl);
    img.removeAttribute("data-src");
    img.removeAttribute("data-original");
    img.removeAttribute("data-backsrc");
  }

  for (const element of Array.from(clone.querySelectorAll("*"))) {
    for (const attr of Array.from(element.attributes)) {
      if (attr.name.toLowerCase().startsWith("on")) {
        element.removeAttribute(attr.name);
      }
    }
  }

  return {
    htmlContent: clone.innerHTML.trim(),
    imageList: [...new Set(imageList)],
  };
}

export function parseWeChatArticleHtml(
  html: string,
  url: string,
): ExtractedContent {
  const dom = new JSDOM(html, { url });
  const { document } = dom.window;
  const title =
    textContent(document, "#activity-name") ||
    metaContent(document, 'meta[property="og:title"]') ||
    document.title.trim() ||
    null;
  const author =
    textContent(document, "#js_name") ||
    metaContent(document, 'meta[property="article:author"]') ||
    null;
  const publisher = author || "WeChat";
  const datePublished =
    textContent(document, "#publish_time") ||
    metaContent(document, 'meta[property="article:published_time"]') ||
    null;
  const description =
    metaContent(document, 'meta[property="og:description"]') ||
    metaContent(document, 'meta[name="description"]') ||
    null;
  const contentElement = document.querySelector("#js_content");
  const cleaned = contentElement
    ? cleanContentElement(contentElement, url)
    : { htmlContent: "", imageList: [] };
  const coverImageUrl =
    absolutizeUrl(metaContent(document, 'meta[property="og:image"]'), url) ||
    absolutizeUrl(extractScriptString(html, "msg_cdn_url"), url) ||
    cleaned.imageList[0] ||
    null;

  if (!title && !cleaned.htmlContent) {
    throw new Error("WeChat article page did not contain title or content");
  }

  return {
    title,
    description,
    author,
    publisher,
    datePublished,
    dateModified: null,
    coverImageUrl,
    htmlContent: cleaned.htmlContent,
    imageList: cleaned.imageList,
    platform: WECHAT_ADAPTER_ID,
    rawExtraction: {
      selectors: {
        title: "#activity-name",
        author: "#js_name",
        publishTime: "#publish_time",
        content: "#js_content",
      },
      imageList: cleaned.imageList,
      coverImageUrl,
      hasContentElement: !!contentElement,
    },
    adapterVersion: WECHAT_ADAPTER_VERSION,
    statusCode: 200,
    url,
    imageReferer: WECHAT_IMAGE_REFERER,
  };
}

export const wechatAdapter: PlatformAdapter = {
  id: WECHAT_ADAPTER_ID,
  version: WECHAT_ADAPTER_VERSION,
  priority: 100,
  match(url: URL) {
    return (
      url.hostname === "mp.weixin.qq.com" && /^\/s(?:\/|$)/.test(url.pathname)
    );
  },
  async extract({
    url,
    abortSignal,
    runProxy,
  }: AdapterExtractInput): Promise<ExtractedContent> {
    const response = await fetchWithProxy(
      url,
      {
        signal: abortSignal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Referer: WECHAT_IMAGE_REFERER,
        },
      },
      runProxy,
    );
    if (!response.ok) {
      throw new Error(`WeChat adapter fetch failed: ${response.status}`);
    }
    const html = await response.text();
    return {
      ...parseWeChatArticleHtml(html, response.url || url),
      statusCode: response.status,
      url: response.url || url,
    };
  },
};
