import { afterAll, beforeAll, describe, it } from "vitest";

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
      const summary = buildSummary(
        results,
        config.EVAL_TEXT_MODEL,
        config.EVAL_CONTEXT_LENGTH,
      );
      printSummary(summary);
      const filePath = saveResults(results, summary);
      console.log(`  Results saved to ${filePath}\n`);
    }
  });

  for (const fixture of dataset) {
    it.concurrent(`[${fixture.category}/${fixture.id}] ${fixture.description}`, async () => {
      const result = await runEvalCase(fixture, tagClient, judgeClient);
      results.push(result);
      printCaseResult(result);
    }, 60_000);
  }
});
