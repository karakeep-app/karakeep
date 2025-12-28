import type { InferenceClient } from "./inferenceClient";
import type { Bookmark } from "./types";

export async function extractBookmarkContent(
  bookmark: Bookmark,
): Promise<string> {
  if (bookmark.content.type === "link") {
    const parts = [];

    if (bookmark.content.url) {
      parts.push(`URL: ${bookmark.content.url}`);
    }

    if (bookmark.title) {
      parts.push(`Title: ${bookmark.title}`);
    }

    if (bookmark.content.description) {
      parts.push(`Description: ${bookmark.content.description}`);
    }

    if (bookmark.content.htmlContent) {
      parts.push(`Content: ${bookmark.content.htmlContent}`);
    }

    return parts.join("\n");
  }

  if (bookmark.content.type === "text" && bookmark.content.text) {
    return bookmark.content.text;
  }

  return "";
}

export async function runTaggingForModel(
  bookmark: Bookmark,
  model: string,
  inferenceClient: InferenceClient,
  lang: string = "english",
): Promise<string[]> {
  const content = await extractBookmarkContent(bookmark);

  if (!content) {
    return [];
  }

  try {
    const tags = await inferenceClient.inferTags(content, model, lang, []);
    return tags;
  } catch (error) {
    throw new Error(
      `Failed to generate tags with ${model}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
