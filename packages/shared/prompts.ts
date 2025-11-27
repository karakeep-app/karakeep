import type { Tiktoken } from "js-tiktoken";

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

/**
 * Remove duplicate whitespaces to avoid tokenization issues
 */
function preprocessContent(content: string) {
  return content.replace(/(\s){10,}/g, "$1");
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

export function buildImagePrompt(lang: string, customPrompts: string[]) {
  return `
You are an expert whose responsibility is to help with automatic text tagging for a read-it-later app.
Please analyze the attached image and suggest relevant tags that describe its key themes, topics, and main ideas. The rules are:
- Aim for a variety of tags, including broad categories, specific keywords, and potential sub-genres.
- The tags must be in ${lang}.
- If the tag is not generic enough, don't include it.
- Aim for 10-15 tags.
- If there are no good tags, don't emit any.
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
You must respond in valid JSON with the key "tags" and the value is list of tags. Don't wrap the response in a markdown code.`;
}

export async function buildTextPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
  contextLength: number,
): Promise<string> {
  content = preprocessContent(content);
  const constructPrompt = (c: string) => `
You are an expert whose responsibility is to help with automatic tagging for a read-it-later app.
Please analyze the TEXT_CONTENT below and suggest relevant tags that describe its key themes, topics, and main ideas. The rules are:
- Aim for a variety of tags, including broad categories, specific keywords, and potential sub-genres.
- The tags must be in ${lang}.
- If the tag is not generic enough, don't include it.
- The content can include text for cookie consent and privacy policy, ignore those while tagging.
- Aim for 3-5 tags.
- If there are no good tags, leave the array empty.
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}

<TEXT_CONTENT>
${c}
</TEXT_CONTENT>
You must respond in JSON with the key "tags" and the value is an array of string tags.`;

  const promptSize = await calculateNumTokens(constructPrompt(""));
  const truncatedContent = await truncateContent(
    content,
    contextLength - promptSize,
  );
  return constructPrompt(truncatedContent);
}

export async function buildSummaryPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
  contextLength: number,
): Promise<string> {
  content = preprocessContent(content);
  const constructPrompt = (c: string) => `
Summarize the following content responding ONLY with the summary. You MUST follow the following rules:
- Summary must be in 3-4 sentences.
- The summary must be in ${lang}.
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
    ${c}`;

  const promptSize = await calculateNumTokens(constructPrompt(""));
  const truncatedContent = await truncateContent(
    content,
    contextLength - promptSize,
  );
  return constructPrompt(truncatedContent);
}
