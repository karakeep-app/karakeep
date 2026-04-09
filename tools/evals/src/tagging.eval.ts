import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { InferenceClient } from "@karakeep/shared/inference";

import { createJudgeClient, createTagClient } from "./client";
import { config } from "./config";
import { dataset } from "./dataset";
import {
  buildSummary,
  printCaseResult,
  printSummary,
  saveResults,
} from "./reporter";
import type { EvalCaseResult } from "./runner";
import { runEvalCase } from "./runner";

let tagClient: InferenceClient;
let judgeClient: InferenceClient;
const results: EvalCaseResult[] = [];

describe("Tagging Eval", () => {
  beforeAll(() => {
    tagClient = createTagClient();
    judgeClient = createJudgeClient();
  });

  afterAll(() => {
    if (results.length > 0) {
      const summary = buildSummary(results, config.EVAL_TEXT_MODEL);
      printSummary(summary);
      const filePath = saveResults(results, summary);
      console.log(`  Results saved to ${filePath}\n`);
    }
  });

  for (const fixture of dataset) {
    it.concurrent(`[${fixture.id}] ${fixture.description}`, async () => {
      const result = await runEvalCase(fixture, tagClient, judgeClient);
      results.push(result);
      printCaseResult(result);

      // Assert minimum thresholds
      expect(
        result.scores.format.score,
        `Format: ${result.scores.format.explanation}`,
      ).toBeGreaterThanOrEqual(1.0);

      expect(
        result.scores.style.score,
        `Style: ${result.scores.style.explanation}`,
      ).toBeGreaterThanOrEqual(0.8);

      if (result.scores.curated) {
        expect(
          result.scores.curated.score,
          `Curated: ${result.scores.curated.explanation}`,
        ).toBeGreaterThanOrEqual(1.0);
      }

      expect(
        result.scores.relevance.score,
        `Relevance: ${result.scores.relevance.explanation}`,
      ).toBeGreaterThanOrEqual(0.6);

      expect(
        result.scores.quality.score,
        `Quality: ${result.scores.quality.explanation}`,
      ).toBeGreaterThanOrEqual(0.6);

      if (result.scores.language) {
        expect(
          result.scores.language.score,
          `Language: ${result.scores.language.explanation}`,
        ).toBeGreaterThanOrEqual(0.8);
      }

      // Check tag count bounds if specified
      if (fixture.minTags !== undefined && !fixture.expectEmpty) {
        expect(
          result.tags.length,
          `Expected at least ${fixture.minTags} tags but got ${result.tags.length}`,
        ).toBeGreaterThanOrEqual(fixture.minTags);
      }
      if (fixture.maxTags !== undefined) {
        expect(
          result.tags.length,
          `Expected at most ${fixture.maxTags} tags but got ${result.tags.length}`,
        ).toBeLessThanOrEqual(fixture.maxTags);
      }
    }, 60_000);
  }
});
