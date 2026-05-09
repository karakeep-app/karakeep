import { describe, expect, test } from "vitest";

import { normalizeChineseTagSynonyms } from "./tagNormalization";

describe("normalizeChineseTagSynonyms", () => {
  test("maps common English and Chinese AI aliases to the canonical Chinese tags", () => {
    expect(
      normalizeChineseTagSynonyms([
        "#AI",
        "人工智能",
        "LLM",
        "大模型",
        "生成式AI",
        "AIGC",
      ]),
    ).toEqual(["人工智能", "大语言模型", "AIGC"]);
  });

  test("deduplicates normalized tags while preserving first-seen order", () => {
    expect(
      normalizeChineseTagSynonyms([
        "Startup",
        "创业",
        "Open Source",
        "开源",
        "PostgreSQL",
      ]),
    ).toEqual(["创业", "开源", "PostgreSQL"]);
  });

  test("ignores empty tags", () => {
    expect(normalizeChineseTagSynonyms(["", "#", "  ", "Tech"])).toEqual([
      "科技",
    ]);
  });
});
