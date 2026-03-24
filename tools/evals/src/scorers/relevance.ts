import { z } from "zod";

import type { InferenceClient } from "@karakeep/shared/inference";

import type { EvalFixture } from "../dataset";
import type { ScoreResult } from "./index";

const judgeResponseSchema = z.object({
  score: z.number().min(1).max(5),
  explanation: z.string(),
});

/**
 * Use an LLM judge to score tag relevance to the content.
 */
export async function scoreRelevance(
  judgeClient: InferenceClient,
  fixture: EvalFixture,
  tags: string[],
): Promise<ScoreResult> {
  if (tags.length === 0) {
    return {
      score: 0.2,
      passed: false,
      explanation: "No tags generated for content that expected tags",
    };
  }

  const contentSnippet = fixture.content.substring(0, 500);
  const prompt = `You are evaluating the quality of auto-generated tags for a bookmarking app.

Content: ${contentSnippet}

Expected topics: ${fixture.expectedTopics.join(", ")}

Generated tags: ${tags.join(", ")}

Rate the tags on a scale of 1-5:
5 = All tags are highly relevant and cover the main topics well
4 = Most tags are relevant with minor gaps
3 = Some tags are relevant but significant gaps or irrelevant tags present
2 = Few tags are relevant
1 = Tags are irrelevant or nonsensical

Respond in JSON: {"score": <1-5>, "explanation": "<brief reason>"}`;

  try {
    const response = await judgeClient.inferFromText(prompt, {
      schema: judgeResponseSchema,
    });
    const parsed = judgeResponseSchema.safeParse(
      JSON.parse(response.response.trim()),
    );

    if (parsed.success) {
      const normalizedScore = parsed.data.score / 5;
      return {
        score: normalizedScore,
        passed: normalizedScore >= 0.6,
        explanation: `Judge score: ${parsed.data.score}/5 — ${parsed.data.explanation}`,
      };
    }

    return {
      score: 0.5,
      passed: false,
      explanation: `Judge response failed validation: ${response.response.substring(0, 100)}`,
    };
  } catch (e) {
    return {
      score: 0.5,
      passed: false,
      explanation: `Judge call failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Score edge cases that should produce empty tags.
 */
export function scoreEmpty(tags: string[]): ScoreResult {
  if (tags.length === 0) {
    return {
      score: 1.0,
      passed: true,
      explanation: "Correctly produced no tags for edge case content",
    };
  }

  // Allow up to 2 tags with reduced score — models sometimes still produce a few
  if (tags.length <= 2) {
    return {
      score: 0.5,
      passed: false,
      explanation: `Expected empty tags but got ${tags.length}: ${tags.join(", ")}`,
    };
  }

  return {
    score: 0.0,
    passed: false,
    explanation: `Expected empty tags but got ${tags.length}: ${tags.join(", ")}`,
  };
}
