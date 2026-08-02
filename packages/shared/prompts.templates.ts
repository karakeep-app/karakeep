import type { ZTagStyle } from "./types/users";
import {
  getCuratedTagsPrompt,
  getPotentialRelevantTagsPrompt,
  getTagStylePrompt,
} from "./utils/tag";

/**
 * Client-safe rendering of external prompt templates (no fs access). Used by
 * ./prompts.external on the server and by the web UI's prompt preview, so
 * both render override templates identically.
 *
 * Templates use `{{placeholder}}` syntax. Reference templates matching the
 * built-in defaults live in packages/shared/prompt-templates/.
 */

export type PromptTemplateName =
  | "text-tagging"
  | "image-tagging"
  | "summary"
  | "ocr";

export interface PromptTemplates {
  textTagging: string | null;
  imageTagging: string | null;
  summary: string | null;
  ocr: string | null;
}

/**
 * Replaces known `{{key}}` placeholders. Unknown placeholders are left
 * intact so that typos remain visible in the rendered prompt.
 */
function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? vars[key] : match,
  );
}

function renderCustomPrompts(customPrompts: string[]): string {
  return customPrompts.map((p) => `- ${p}`).join("\n");
}

export function renderTextTaggingTemplate(
  template: string,
  lang: string,
  customPrompts: string[],
  content: string,
  tagStyle: ZTagStyle,
  curatedTags?: string[],
  potentialRelevantTags?: string[],
): string {
  return render(template, {
    lang,
    content,
    tagStyle: getTagStylePrompt(tagStyle),
    curatedTags: getCuratedTagsPrompt(curatedTags),
    potentialRelevantTags: getPotentialRelevantTagsPrompt(
      potentialRelevantTags,
    ),
    customPrompts: renderCustomPrompts(customPrompts),
  });
}

export function renderImageTaggingTemplate(
  template: string,
  lang: string,
  customPrompts: string[],
  tagStyle: ZTagStyle,
  curatedTags?: string[],
  potentialRelevantTags?: string[],
): string {
  return render(template, {
    lang,
    tagStyle: getTagStylePrompt(tagStyle),
    curatedTags: getCuratedTagsPrompt(curatedTags),
    potentialRelevantTags: getPotentialRelevantTagsPrompt(
      potentialRelevantTags,
    ),
    customPrompts: renderCustomPrompts(customPrompts),
  });
}

export function renderSummaryTemplate(
  template: string,
  lang: string,
  customPrompts: string[],
  content: string,
): string {
  return render(template, {
    lang,
    content,
    customPrompts: renderCustomPrompts(customPrompts),
  });
}
