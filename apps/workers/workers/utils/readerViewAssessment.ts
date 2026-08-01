import { isProbablyReaderable } from "@mozilla/readability";

import type {
  ZReaderViewReason,
  ZReaderViewStatus,
} from "@karakeep/shared/types/bookmarks";

export const READER_VIEW_CLASSIFIER_VERSION = 3;

export interface ReaderViewAssessment {
  status: ZReaderViewStatus;
  score: number;
  reasons: ZReaderViewReason[];
  classifierVersion: number;
}

const ARTICLE_SCHEMA_PATTERN =
  /"@type"\s*:\s*(?:\[[^\]]*)?"(?:Article|NewsArticle|BlogPosting|TechArticle|ScholarlyArticle|Report)"/i;
const NON_ARTICLE_SCHEMA_PATTERN =
  /"@type"\s*:\s*(?:\[[^\]]*)?"(?:Product|WebApplication|SearchResultsPage|ItemList)"/i;
const CHALLENGE_PATTERN =
  /(?:verify (?:that )?you are human|checking your browser|captcha|access denied|enable javascript and cookies|security challenge)/i;
const SENTENCE_END_PATTERN = /(?:[.!?](?:\s|$)|[。！？])/gu;

function normalizedText(document: Document): string {
  return (document.body?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function schemaText(document: Document): string {
  return [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((node) => node.textContent ?? "")
    .join("\n");
}

function hasArticleMetadata(document: Document): boolean {
  const ogType = document
    .querySelector('meta[property="og:type"]')
    ?.getAttribute("content")
    ?.toLowerCase();
  return (
    ogType === "article" ||
    !!document.querySelector(
      '[itemtype*="schema.org/Article"], [itemtype*="schema.org/NewsArticle"], [itemtype*="schema.org/BlogPosting"]',
    ) ||
    ARTICLE_SCHEMA_PATTERN.test(schemaText(document))
  );
}

function hasNonArticleMetadata(document: Document): boolean {
  return (
    !!document.querySelector(
      '[itemtype*="schema.org/Product"], [itemtype*="schema.org/WebApplication"], [itemtype*="schema.org/SearchResultsPage"], [itemtype*="schema.org/ItemList"]',
    ) || NON_ARTICLE_SCHEMA_PATTERN.test(schemaText(document))
  );
}

function hasSearchUrlSignal(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathLooksLikeSearch = /\/(?:search|results)(?:\/|$)/i.test(
      parsed.pathname,
    );
    const params = new Set(
      [...parsed.searchParams.keys()].map((key) => key.toLowerCase()),
    );
    return (
      pathLooksLikeSearch ||
      params.has("q") ||
      params.has("query") ||
      params.has("keyword") ||
      params.has("search")
    );
  } catch {
    return false;
  }
}

function isRootUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.pathname === "/" || parsed.pathname === "") && !parsed.search
    );
  } catch {
    return false;
  }
}

function statusForScore(score: number): ZReaderViewStatus {
  if (score >= 70) {
    return "readable";
  }
  if (score >= 35) {
    return "uncertain";
  }
  return "not_readable";
}

export function unavailableReaderViewAssessment(): ReaderViewAssessment {
  return {
    status: "unavailable",
    score: 0,
    reasons: ["no_extracted_content"],
    classifierVersion: READER_VIEW_CLASSIFIER_VERSION,
  };
}

export function assessReaderView(
  sourceDocument: Document,
  extractedDocument: Document,
  url: string,
): ReaderViewAssessment {
  let score = 50;
  const reasons: ZReaderViewReason[] = [];
  const sourceText = normalizedText(sourceDocument);
  const extractedText = normalizedText(extractedDocument);
  const textLength = extractedText.length;
  const articleMetadata = hasArticleMetadata(sourceDocument);
  const rootPage = isRootUrl(url) && !articleMetadata;

  if (articleMetadata) {
    score += 20;
    reasons.push("article_metadata");
  } else if (hasNonArticleMetadata(sourceDocument)) {
    score -= 20;
    reasons.push("non_article_metadata");
  }

  if (sourceDocument.querySelector("article")) {
    score += 10;
    reasons.push("article_element");
  }

  if (textLength < 80) {
    score -= 30;
    reasons.push("very_short_content");
  } else if (textLength < 200) {
    score -= 15;
    reasons.push("short_content");
  } else if (textLength >= 1_500) {
    score += 25;
    reasons.push("substantial_content_length");
  } else if (textLength >= 500) {
    score += 15;
    reasons.push("useful_content_length");
  }

  const substantiveBlocks = [
    ...extractedDocument.querySelectorAll("p, pre, blockquote"),
  ].filter((node) => (node.textContent?.trim().length ?? 0) >= 80).length;
  const hasLongPreformattedBlock = [
    ...extractedDocument.querySelectorAll("pre"),
  ].some((node) => (node.textContent?.trim().length ?? 0) >= 300);

  if (substantiveBlocks === 0) {
    score -= 25;
    reasons.push("no_substantive_blocks");
  } else if (substantiveBlocks === 1) {
    score -= 10;
    reasons.push("single_substantive_block");
  } else if (substantiveBlocks >= 4) {
    score += 15;
    reasons.push("multiple_substantive_blocks");
  } else {
    score += 5;
    reasons.push("some_substantive_blocks");
  }

  if (hasLongPreformattedBlock) {
    score += 15;
    reasons.push("long_preformatted_content");
  }

  const linkTextLength = [...extractedDocument.querySelectorAll("a")].reduce(
    (total, link) => total + (link.textContent?.trim().length ?? 0),
    0,
  );
  const linkDensity = linkTextLength / Math.max(textLength, 1);
  if (linkDensity > 0.65) {
    score -= 35;
    reasons.push("very_high_link_density");
  } else if (linkDensity > 0.4) {
    score -= 25;
    reasons.push("high_link_density");
  } else if (linkDensity > 0.25) {
    score -= 10;
    reasons.push("elevated_link_density");
  } else if (linkDensity <= 0.12 && textLength >= 200) {
    score += 10;
    reasons.push("low_link_density");
  }

  const controls = sourceDocument.querySelectorAll(
    "button, input, select, textarea",
  ).length;
  const sourceParagraphs =
    sourceDocument.querySelectorAll("p, pre, blockquote").length;
  if (controls >= 3 && controls > sourceParagraphs) {
    score -= 15;
    reasons.push("control_heavy_page");
  }

  const extractedLinks = extractedDocument.querySelectorAll("a").length;
  if (extractedLinks >= 8 && substantiveBlocks <= 1) {
    score -= 20;
    reasons.push("link_collection");
  }

  if (hasSearchUrlSignal(url) && !articleMetadata) {
    score -= 25;
    reasons.push("search_url");
  }

  if (rootPage) {
    score -= 10;
    reasons.push("root_page");
  }

  if (CHALLENGE_PATTERN.test(sourceText.slice(0, 5_000))) {
    score -= 40;
    reasons.push("challenge_page");
  }

  const sentenceEndCount =
    extractedText.match(SENTENCE_END_PATTERN)?.length ?? 0;
  if (sentenceEndCount >= 3) {
    score += 10;
    reasons.push("sentence_like_text");
  } else if (textLength >= 200) {
    score -= 10;
    reasons.push("low_sentence_density");
  }

  if (isProbablyReaderable(sourceDocument)) {
    score += 10;
    reasons.push("probably_readerable");
  } else {
    score -= 10;
    reasons.push("probably_not_readerable");
  }

  // A homepage can contain a large amount of polished marketing copy while
  // still lacking a coherent standalone document. Without explicit article
  // metadata, require the user to opt into Reader View.
  if (rootPage) {
    score = Math.min(score, 60);
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    status: statusForScore(normalizedScore),
    score: normalizedScore,
    reasons,
    classifierVersion: READER_VIEW_CLASSIFIER_VERSION,
  };
}
