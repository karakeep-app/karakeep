import fs from "node:fs";
import path from "node:path";

import type { PromptTemplateName, PromptTemplates } from "./prompts.templates";
import type { ZTagStyle } from "./types/users";
import logger from "./logger";
import * as defaultPrompts from "./prompts";
import {
  renderImageTaggingTemplate,
  renderSummaryTemplate,
  renderTextTaggingTemplate,
} from "./prompts.templates";

/**
 * Server-side drop-in replacement for ./prompts that allows overriding the
 * built-in prompt templates with files on disk. For each prompt kind, if
 * `${PROMPTS_DIR}/<name>.txt` exists it is used as the template; otherwise
 * the built-in prompt from ./prompts is used unchanged.
 *
 * PROMPTS_DIR defaults to `${DATA_DIR}/prompts`, so in a docker deployment
 * override files can simply be dropped into the existing data volume
 * (e.g. /data/prompts/text-tagging.txt).
 *
 * Template rendering lives in ./prompts.templates (client-safe), so the web
 * UI's prompt preview renders override templates identically.
 */

function promptsDir(): string {
  return (
    process.env.PROMPTS_DIR ?? path.join(process.env.DATA_DIR ?? "", "prompts")
  );
}

interface CacheEntry {
  mtimeMs: number;
  text: string;
}

const templateCache = new Map<string, CacheEntry>();

/**
 * Returns the override template for `name`, or null if no override file
 * exists. Reads are cached and invalidated on mtime change, so templates
 * can be edited without restarting the service.
 */
export function loadTemplate(name: PromptTemplateName): string | null {
  const file = path.join(promptsDir(), `${name}.txt`);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  const cached = templateCache.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.text;
  }
  const text = fs.readFileSync(file, "utf8");
  templateCache.set(file, { mtimeMs: stat.mtimeMs, text });
  logger.info(`[prompts] Loaded external prompt template from ${file}`);
  return text;
}

/**
 * Returns all override templates (null for the ones without an override
 * file). Used by the web UI's prompt preview.
 */
export function getExternalPromptTemplates(): PromptTemplates {
  return {
    textTagging: loadTemplate("text-tagging"),
    imageTagging: loadTemplate("image-tagging"),
    summary: loadTemplate("summary"),
    ocr: loadTemplate("ocr"),
  };
}

export function buildImagePrompt(
  lang: string,
  customPrompts: string[],
  tagStyle: ZTagStyle,
  curatedTags?: string[],
) {
  const template = loadTemplate("image-tagging");
  if (template === null) {
    return defaultPrompts.buildImagePrompt(
      lang,
      customPrompts,
      tagStyle,
      curatedTags,
    );
  }
  return renderImageTaggingTemplate(
    template,
    lang,
    customPrompts,
    tagStyle,
    curatedTags,
  );
}

export function constructTextTaggingPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
  tagStyle: ZTagStyle,
  curatedTags?: string[],
): string {
  const template = loadTemplate("text-tagging");
  if (template === null) {
    return defaultPrompts.constructTextTaggingPrompt(
      lang,
      customPrompts,
      content,
      tagStyle,
      curatedTags,
    );
  }
  return renderTextTaggingTemplate(
    template,
    lang,
    customPrompts,
    content,
    tagStyle,
    curatedTags,
  );
}

export function constructSummaryPrompt(
  lang: string,
  customPrompts: string[],
  content: string,
): string {
  const template = loadTemplate("summary");
  if (template === null) {
    return defaultPrompts.constructSummaryPrompt(lang, customPrompts, content);
  }
  return renderSummaryTemplate(template, lang, customPrompts, content);
}

export function buildOCRPrompt(): string {
  return loadTemplate("ocr") ?? defaultPrompts.buildOCRPrompt();
}
