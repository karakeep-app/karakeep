import type { Tiktoken } from "js-tiktoken";

import type { ZTagStyle } from "./types/users";
import { constructSummaryPrompt, constructTextTaggingPrompt } from "./prompts";

let encoding: Tiktoken | null = null;

/**
 * Lazy load the encoding to avoid loading the tiktoken data into memory
 * until it's actually needed
 */
async function getEncodingInstance(): Promise<Tiktoken> {
  if (!encoding) {
    // Dynamic import to lazy load the tiktoken module
    const { getEncoding } = await import("js-tiktoken");
    encoding = getEncoding("o200k_base");
  }
  return encoding;
}

async function calculateNumTokens(text: string): Promise<number> {
  const enc = await getEncodingInstance();
  return enc.encode(text).length;
}

async function truncateContent(
  content: string,
  length: number,
): Promise<string> {
  const enc = await getEncodingInstance();
  const tokens = enc.encode(content);
  if (tokens.length <= length) {
    return content;
  }
  const truncatedTokens = tokens.slice(0, length);
  return enc.decode(truncatedTokens);
}

/**
 * Remove duplicate whitespaces to avoid tokenization issues
 */
function preprocessContent(content: string) {
  return content.replace(/(\s){10,}/g, "$1");
}

export async function buildTextPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
  contextLength: number,
  tagStyle: ZTagStyle,
  curatedTags?: string[],
): Promise<string> {
  content = preprocessContent(content);
  const promptTemplate = constructTextTaggingPrompt(
    lang,
    customPrompts,
    "",
    tagStyle,
    curatedTags,
  );
  const promptSize = await calculateNumTokens(promptTemplate);
  const truncatedContent = await truncateContent(
    content,
    contextLength - promptSize,
  );
  return constructTextTaggingPrompt(
    lang,
    customPrompts,
    truncatedContent,
    tagStyle,
    curatedTags,
  );
}

export async function buildSummaryPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
  contextLength: number,
): Promise<string> {
  content = preprocessContent(content);
  const promptTemplate = constructSummaryPrompt(lang, customPrompts, "");
  const promptSize = await calculateNumTokens(promptTemplate);
  const truncatedContent = await truncateContent(
    content,
    contextLength - promptSize,
  );
  return constructSummaryPrompt(lang, customPrompts, truncatedContent);
}
