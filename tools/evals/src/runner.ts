import type { InferenceClient } from "@karakeep/shared/inference";
import { constructTextTaggingPrompt } from "@karakeep/shared/prompts";
import { buildTextPrompt } from "@karakeep/shared/prompts.server";
import { z } from "zod";

import type { EvalFixture } from "./dataset";
import { config } from "./config";
import type { ScoreResult } from "./scorers";
import {
  scoreCurated,
  scoreEmpty,
  scoreFormat,
  scoreLanguage,
  scoreRelevance,
  scoreStyle,
} from "./scorers";

const openAIResponseSchema = z.object({
  tags: z.array(z.string()),
});

export interface EvalCaseScores {
  format: ScoreResult;
  style: ScoreResult;
  curated: ScoreResult | null;
  relevance: ScoreResult;
  language: ScoreResult | null;
}

export interface EvalCaseResult {
  fixture: EvalFixture;
  rawResponse: string;
  tags: string[];
  scores: EvalCaseScores;
  totalTokens: number | undefined;
}

export async function runEvalCase(
  fixture: EvalFixture,
  tagClient: InferenceClient,
  judgeClient: InferenceClient,
): Promise<EvalCaseResult> {
  // Use per-fixture contextLength override, or fall back to global config
  const contextLength = fixture.contextLength ?? config.EVAL_CONTEXT_LENGTH;

  // 1. Build prompt using the real prompt functions
  let prompt: string;
  if (fixture.content.length > 0) {
    prompt = await buildTextPrompt(
      fixture.lang,
      fixture.customPrompts,
      fixture.content,
      contextLength,
      fixture.tagStyle,
      fixture.curatedTags,
    );
  } else {
    prompt = constructTextTaggingPrompt(
      fixture.lang,
      fixture.customPrompts,
      fixture.content,
      fixture.tagStyle,
      fixture.curatedTags,
    );
  }

  // 2. Run inference
  const response = await tagClient.inferFromText(prompt, {
    schema: openAIResponseSchema,
  });

  // 3. Parse response and run scorers
  const formatResult = scoreFormat(response.response);
  const tags = formatResult.tags ?? [];

  // Clean tags (strip #, trim) — same as production code
  const cleanedTags = tags
    .map((t) => {
      let tag = t;
      if (tag.startsWith("#")) {
        tag = tag.slice(1);
      }
      return tag.trim();
    })
    .filter((t) => t.length > 0);

  // 4. Run scorers
  const styleScore = scoreStyle(cleanedTags, fixture.tagStyle);

  const curatedScore = fixture.curatedTags
    ? scoreCurated(cleanedTags, fixture.curatedTags)
    : null;

  const relevanceScore = fixture.expectEmpty
    ? scoreEmpty(cleanedTags)
    : await scoreRelevance(judgeClient, fixture, cleanedTags);

  const languageScore =
    fixture.lang.toLowerCase() !== "english"
      ? await scoreLanguage(judgeClient, cleanedTags, fixture.lang)
      : null;

  return {
    fixture,
    rawResponse: response.response,
    tags: cleanedTags,
    scores: {
      format: formatResult.score,
      style: styleScore,
      curated: curatedScore,
      relevance: relevanceScore,
      language: languageScore,
    },
    totalTokens: response.totalTokens,
  };
}
