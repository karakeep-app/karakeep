import { setImmediate } from "node:timers/promises";
import type { Tiktoken } from "tiktoken/lite";

import type { ZTagStyle } from "./types/users";
import { constructSummaryPrompt, constructTextTaggingPrompt } from "./prompts";

// BPE is quadratic on long runs without breaks (e.g. unspaced Chinese or Thai)
// and blocks the event loop, so text is encoded in chunks of this many chars.
// A token spanning two chunks is counted as two, which is negligible.
const CHUNK_SIZE = 2048;

let encoding: Tiktoken | null = null;

/**
 * Lazy load the encoding to avoid loading the tiktoken data into memory
 * until it's actually needed. It's kept for the lifetime of the process.
 */
async function getEncodingInstance(): Promise<Tiktoken> {
  if (!encoding) {
    const [{ Tiktoken }, { default: o200k }] = await Promise.all([
      import("tiktoken/lite"),
      import("tiktoken/encoders/o200k_base"),
    ]);
    // Concurrent callers can get here together, only the first one creates it.
    encoding ??= new Tiktoken(
      o200k.bpe_ranks,
      o200k.special_tokens,
      o200k.pat_str,
    );
  }
  return encoding;
}

/**
 * Cuts the text to at most `end` chars without splitting a surrogate pair.
 */
function sliceChars(text: string, start: number, end: number): string {
  const splitsPair =
    end < text.length &&
    /^[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(text.slice(end - 1, end + 1));
  return text.slice(start, splitsPair ? end - 1 : end);
}

/**
 * Encodes the text chunk by chunk, yielding to the event loop between chunks.
 */
async function* encodeChunks(enc: Tiktoken, text: string) {
  for (let offset = 0; offset < text.length;) {
    if (offset > 0) {
      await setImmediate();
    }
    const chunk = sliceChars(text, offset, offset + CHUNK_SIZE);
    // The text is untrusted, so special tokens in it are encoded as plain text.
    // (`encode` throws on them.)
    yield { offset, tokens: enc.encode_ordinary(chunk) };
    offset += chunk.length;
  }
}

async function calculateNumTokens(text: string): Promise<number> {
  const enc = await getEncodingInstance();
  let numTokens = 0;
  for await (const { tokens } of encodeChunks(enc, text)) {
    numTokens += tokens.length;
  }
  return numTokens;
}

async function truncateContent(
  content: string,
  length: number,
): Promise<string> {
  const enc = await getEncodingInstance();
  // A generous upper bound on the characters that can fit in the token budget.
  content = sliceChars(content, 0, length * 8);
  let remaining = length;
  for await (const { offset, tokens } of encodeChunks(enc, content)) {
    if (tokens.length > remaining) {
      // The cut can fall in the middle of a character. Decoding in streaming
      // mode leaves out its incomplete bytes instead of replacing them.
      const kept = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
        enc.decode(tokens.subarray(0, remaining)),
        { stream: true },
      );
      return content.slice(0, offset + kept.length);
    }
    remaining -= tokens.length;
  }
  return content;
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
  potentialRelevantTags?: string[],
): Promise<string> {
  content = preprocessContent(content);
  const promptTemplate = constructTextTaggingPrompt(
    lang,
    customPrompts,
    "",
    tagStyle,
    curatedTags,
    potentialRelevantTags,
  );
  const promptSize = await calculateNumTokens(promptTemplate);
  const available = Math.max(0, contextLength - promptSize);
  const truncatedContent =
    available === 0 ? "" : await truncateContent(content, available);
  return constructTextTaggingPrompt(
    lang,
    customPrompts,
    truncatedContent,
    tagStyle,
    curatedTags,
    potentialRelevantTags,
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
  const available = Math.max(0, contextLength - promptSize);
  const truncatedContent =
    available === 0 ? "" : await truncateContent(content, available);
  return constructSummaryPrompt(lang, customPrompts, truncatedContent);
}
