import { describe, expect, test } from "vitest";

import {
  buildImagePrompt,
  constructTextTaggingPrompt,
  shouldUseChineseTextTaggingPrompt,
} from "./prompts";

describe("text tagging prompts", () => {
  test("uses Chinese prompt when the requested tag language is Chinese", () => {
    const prompt = constructTextTaggingPrompt(
      "zh",
      [],
      "这是一篇关于大模型产品发布的文章。",
      "as-generated",
    );

    expect(prompt).toContain("中文内容自动打标专家");
    expect(prompt).toContain("标签必须使用中文");
  });

  test("uses Chinese prompt for Chinese-first platforms even when the user language is English", () => {
    const prompt = constructTextTaggingPrompt(
      "English",
      [],
      "Title: 微信文章",
      "as-generated",
      undefined,
      {
        platform: "wechat",
        author: "作者",
        publisher: "公众号",
        rawExtraction: {
          imageList: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
          hasContentElement: true,
        },
      },
    );

    expect(prompt).toContain("中文内容自动打标专家");
    expect(prompt).toContain("<PLATFORM_METADATA>");
    expect(prompt).toContain("platform: wechat");
    expect(prompt).toContain("imageCount: 2");
  });

  test("keeps the existing generic prompt for non-Chinese content", () => {
    expect(shouldUseChineseTextTaggingPrompt("English")).toBe(false);
    expect(
      constructTextTaggingPrompt(
        "English",
        [],
        "A technical article about Postgres indexing.",
        "as-generated",
      ),
    ).toContain("The tags must be in English");
  });

  test("includes OCR metadata in image tagging prompts", () => {
    const prompt = buildImagePrompt("English", [], "as-generated", undefined, {
      imageOcrText: "invoice total 128.00",
    });

    expect(prompt).toContain("<PLATFORM_METADATA>");
    expect(prompt).toContain("imageOcrText: invoice total 128.00");
  });
});
