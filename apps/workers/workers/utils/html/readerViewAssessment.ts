import { isProbablyReaderable } from "@mozilla/readability";

import type {
  ZReaderViewReason,
  ZReaderViewStatus,
} from "@karakeep/shared/types/bookmarks";

export const READER_VIEW_CLASSIFIER_VERSION = 6;

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

/**
 * Downgrades an assessment when the rendered page turned out to be a
 * bot-protection or consent challenge page, so challenge pages are never
 * stored as `readable`.
 */
export function applyChallengePageAssessment(
  assessment: ReaderViewAssessment | null,
  isChallengePage: boolean,
): ReaderViewAssessment | null {
  if (!assessment || !isChallengePage) {
    return assessment;
  }
  const reasons: ZReaderViewReason[] = assessment.reasons.includes(
    "challenge_page",
  )
    ? assessment.reasons
    : [...assessment.reasons, "challenge_page"];
  if (assessment.status === "unavailable") {
    return {
      ...assessment,
      reasons,
    };
  }
  return {
    ...assessment,
    status: "not_readable",
    score: 0,
    reasons,
  };
}

export function assessReaderView(
  sourceDocument: Document,
  extractedDocument: Document,
  url: string,
): ReaderViewAssessment {
  let score = 50;
  const reasons: ZReaderViewReason[] = [];
  const extractedText = normalizedText(extractedDocument);
  const textLength = extractedText.length;
  const articleMetadata = hasArticleMetadata(sourceDocument);
  const controls = sourceDocument.querySelectorAll(
    "button, input, select, textarea",
  ).length;
  const sourceParagraphs =
    sourceDocument.querySelectorAll("p, pre, blockquote").length;
  const controlHeavyPage = controls >= 3 && controls > sourceParagraphs;
  const rootPage = isRootUrl(url) && (!articleMetadata || controlHeavyPage);

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

  const linkTextLength = [...extractedDocument.querySelectorAll("a")].reduce(
    (total, link) => total + (link.textContent?.trim().length ?? 0),
    0,
  );
  const linkDensity = linkTextLength / Math.max(textLength, 1);

  let substantiveBlocks = [
    ...extractedDocument.querySelectorAll("p, pre, blockquote"),
  ].filter((node) => (node.textContent?.trim().length ?? 0) >= 80).length;
  // Classic HTML essays separate paragraphs with `<br><br>` inside
  // `<font>`/`<td>` rather than `<p>` elements. When the extracted HTML has no
  // `<p>` tags and isn't a link-heavy index, count `<br><br>`-delimited prose
  // chunks (excluding link text) as substantive blocks so long essays aren't
  // misclassified as link collections.
  if (
    substantiveBlocks < 4 &&
    linkDensity <= 0.2 &&
    extractedDocument.querySelectorAll("p").length === 0
  ) {
    const bodyHtml = extractedDocument.body?.innerHTML ?? "";
    const brChunks = bodyHtml.split(/<br\s*\/?>\s*<br\s*\/?>/i);
    if (brChunks.length >= 2) {
      const brBlocks = brChunks.filter(
        (chunk) =>
          chunk
            .replace(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim().length >= 80,
      ).length;
      substantiveBlocks = Math.max(substantiveBlocks, brBlocks);
    }
  }
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

  if (controlHeavyPage) {
    score -= 15;
    reasons.push("control_heavy_page");
  }

  const extractedLinks = extractedDocument.querySelectorAll("a").length;
  // Don't penalize single-block abstracts (e.g. academic paper pages) that
  // have low link density alongside author/citation links.
  if (
    extractedLinks >= 8 &&
    (substantiveBlocks === 0 || (substantiveBlocks === 1 && linkDensity > 0.12))
  ) {
    score -= 20;
    reasons.push("link_collection");
  }

  const searchPage = hasSearchUrlSignal(url) && !articleMetadata;
  if (searchPage) {
    score -= 25;
    reasons.push("search_url");
  }

  if (rootPage) {
    score -= 10;
    reasons.push("root_page");
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

  const probablyReaderable = isProbablyReaderable(sourceDocument);
  if (probablyReaderable) {
    score += 10;
    reasons.push("probably_readerable");
  } else {
    score -= 10;
    reasons.push("probably_not_readerable");
  }

  // A homepage, search results page, or block-less portal/card page can have
  // lots of extracted text without forming a coherent standalone document.
  // Require the user to opt into Reader View instead of auto-selecting it.
  if (searchPage) {
    score = Math.min(score, 50);
  }
  if (
    rootPage ||
    (substantiveBlocks === 0 &&
      !hasLongPreformattedBlock &&
      !probablyReaderable)
  ) {
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
