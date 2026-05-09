import type { ZTagStyle } from "./types/users";
import { getCuratedTagsPrompt, getTagStylePrompt } from "./utils/tag";

export interface TextTaggingMetadata {
  platform?: string | null;
  author?: string | null;
  publisher?: string | null;
  imageOcrText?: string | null;
  rawExtraction?: Record<string, unknown> | null;
}

const CHINESE_TAGGING_PLATFORMS = new Set([
  "wechat",
  "weixin",
  "xhs",
  "xiaohongshu",
  "douyin",
]);

/**
 * Remove duplicate whitespaces to avoid tokenization issues
 */
function preprocessContent(content: string) {
  return content.replace(/(\s){10,}/g, "$1");
}

function normalizeLang(lang: string) {
  return lang.trim().toLowerCase().replace("_", "-");
}

export function shouldUseChineseTextTaggingPrompt(
  lang: string,
  metadata?: TextTaggingMetadata,
): boolean {
  const normalizedLang = normalizeLang(lang);
  if (
    normalizedLang === "zh" ||
    normalizedLang === "zh-cn" ||
    normalizedLang === "zh-hans" ||
    normalizedLang === "chinese" ||
    normalizedLang === "中文"
  ) {
    return true;
  }

  const platform = metadata?.platform?.trim().toLowerCase();
  return !!platform && CHINESE_TAGGING_PLATFORMS.has(platform);
}

function getChineseCuratedTagsPrompt(curatedTags?: string[]): string {
  if (curatedTags && curatedTags.length > 0) {
    return `- 只能从这个预设标签列表中选择：[${curatedTags.join(", ")}]。不要创建列表之外的新标签；如果都不合适，返回空数组。`;
  }
  return "";
}

function formatTaggingMetadata(metadata?: TextTaggingMetadata): string {
  if (!metadata) {
    return "";
  }

  const fields: string[] = [];
  if (metadata.platform) {
    fields.push(`platform: ${metadata.platform}`);
  }
  if (metadata.author) {
    fields.push(`author: ${metadata.author}`);
  }
  if (metadata.publisher) {
    fields.push(`publisher: ${metadata.publisher}`);
  }

  const rawExtraction = metadata.rawExtraction;
  if (rawExtraction) {
    const imageList = rawExtraction.imageList;
    if (Array.isArray(imageList)) {
      fields.push(`imageCount: ${imageList.length}`);
    }
    if (typeof rawExtraction.hasContentElement === "boolean") {
      fields.push(`hasContentElement: ${rawExtraction.hasContentElement}`);
    }
  }

  if (metadata.imageOcrText) {
    fields.push(`imageOcrText: ${metadata.imageOcrText.slice(0, 1200)}`);
  }

  if (fields.length === 0) {
    return "";
  }

  return `
<PLATFORM_METADATA>
${fields.join("\n")}
</PLATFORM_METADATA>`;
}

function constructChineseTextTaggingPrompt(
  customPrompts: string[],
  content: string,
  tagStyle: ZTagStyle,
  curatedTags?: string[],
  metadata?: TextTaggingMetadata,
): string {
  const tagStyleInstruction = getTagStylePrompt(tagStyle);
  const curatedInstruction = getChineseCuratedTagsPrompt(curatedTags);
  const metadataBlock = formatTaggingMetadata(metadata);

  return `
你是 read-it-later / bookmark 应用的中文内容自动打标专家。
请分析下面的 TEXT_CONTENT，并结合 PLATFORM_METADATA（如果存在）生成能描述文章主题、领域、人物/公司、内容类型和长期检索价值的标签。规则：
- 标签必须使用中文；仅在专有名词、产品名、公司名或技术缩写本身更常用英文时保留英文。
- 优先生成可复用的主题标签，不要生成过细的一次性短语。
- 优先覆盖：主题、行业、技术、产品/公司/人物、内容类型、观点或事件类型。
- 不要生成与错误页、403/404、登录墙、Cookie/GDPR 提示、导航栏、页脚、广告样板文案相关的标签。
- 目标生成 3-5 个标签；如果没有合适标签，返回空数组。
${curatedInstruction}
${tagStyleInstruction ? `- 标签格式偏好：${tagStyleInstruction.replace(/^- /, "")}` : ""}
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
${metadataBlock}

<TEXT_CONTENT>
${content}
</TEXT_CONTENT>
必须返回 JSON，格式为 {"tags":["标签1","标签2"]}，不要包裹 markdown 代码块。`;
}

export function buildImagePrompt(
  lang: string,
  customPrompts: string[],
  tagStyle: ZTagStyle,
  curatedTags?: string[],
  metadata?: TextTaggingMetadata,
) {
  const tagStyleInstruction = getTagStylePrompt(tagStyle);
  const curatedInstruction = getCuratedTagsPrompt(curatedTags);
  const metadataBlock = formatTaggingMetadata(metadata);

  return `
You are an expert whose responsibility is to help with automatic text tagging for a read-it-later/bookmarking app.
Analyze the attached image and suggest relevant tags that describe its key themes, topics, and main ideas. The rules are:
- Aim for a variety of tags, including broad categories, specific keywords, and potential sub-genres.
- The tags must be in ${lang}.
- If the tag is not generic enough, don't include it.
- Aim for 10-15 tags.
- If there are no good tags, don't emit any.
${curatedInstruction}
${tagStyleInstruction}
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
${metadataBlock}
You must respond in valid JSON with the key "tags" and the value is list of tags. Don't wrap the response in a markdown code.`;
}

/**
 * Construct tagging prompt for text content
 */
export function constructTextTaggingPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
  tagStyle: ZTagStyle,
  curatedTags?: string[],
  metadata?: TextTaggingMetadata,
): string {
  if (shouldUseChineseTextTaggingPrompt(lang, metadata)) {
    return constructChineseTextTaggingPrompt(
      customPrompts,
      content,
      tagStyle,
      curatedTags,
      metadata,
    );
  }

  const tagStyleInstruction = getTagStylePrompt(tagStyle);
  const curatedInstruction = getCuratedTagsPrompt(curatedTags);
  const metadataBlock = formatTaggingMetadata(metadata);

  return `
You are an expert whose responsibility is to help with automatic tagging for a read-it-later/bookmarking app.
Analyze the TEXT_CONTENT below and suggest relevant tags that describe its key themes, topics, and main ideas. The rules are:
- Aim for a variety of tags, including broad categories, specific keywords, and potential sub-genres.
- The tags must be in ${lang}.
- If the tag is not generic enough, don't include it.
- Do NOT generate tags related to:
    - An error page (404, 403, blocked, not found, dns errors)
    - Boilerplate content (cookie consent, login walls, GDPR notices)
- Aim for 3-5 tags.
- If there are no good tags, leave the array empty.
${curatedInstruction}
${tagStyleInstruction}
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
${metadataBlock}

<TEXT_CONTENT>
${content}
</TEXT_CONTENT>
You must respond in JSON with the key "tags" and the value is an array of string tags.`;
}

/**
 * Construct summary prompt
 */
export function constructSummaryPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
): string {
  return `
Summarize the following content responding ONLY with the summary. You MUST follow the following rules:
- Summary must be in 3-4 sentences.
- The summary must be in ${lang}.
${customPrompts && customPrompts.map((p) => `- ${p}`).join("\n")}
    ${content}`;
}

/**
 * Build text tagging prompt without truncation (for previews/UI)
 */
export function buildTextPromptUntruncated(
  lang: string,
  customPrompts: string[],
  content: string,
  tagStyle: ZTagStyle,
  curatedTags?: string[],
  metadata?: TextTaggingMetadata,
): string {
  return constructTextTaggingPrompt(
    lang,
    customPrompts,
    preprocessContent(content),
    tagStyle,
    curatedTags,
    metadata,
  );
}

/**
 * Build summary prompt without truncation (for previews/UI)
 */
export function buildSummaryPromptUntruncated(
  lang: string,
  customPrompts: string[],
  content: string,
): string {
  return constructSummaryPrompt(
    lang,
    customPrompts,
    preprocessContent(content),
  );
}

/**
 * Build OCR prompt for extracting text from images using LLM
 */
export function buildOCRPrompt(): string {
  return `You are an OCR (Optical Character Recognition) expert. Your task is to extract ALL text from this image.

Rules:
- Extract every piece of text visible in the image, including titles, body text, captions, labels, watermarks, and any other textual content.
- Preserve the original structure and formatting as much as possible (e.g., paragraphs, lists, headings).
- If text appears in multiple columns, read from left to right, top to bottom.
- If text is partially obscured or unclear, make your best attempt and indicate uncertainty with [unclear] if needed.
- Do not add any commentary, explanations, or descriptions of non-text elements.
- If there is no text in the image, respond with an empty string.
- Output ONLY the extracted text, nothing else.`;
}
