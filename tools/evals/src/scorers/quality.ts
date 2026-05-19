import { z } from "zod";

import type { InferenceClient } from "@karakeep/shared/inference";

import type { ScoreResult } from "./index";

const judgeResponseSchema = z.object({
  score: z.number().min(1).max(5),
  explanation: z.string(),
});

/**
 * Use an LLM judge to score the practical quality of generated tags
 * for retrieval, organization, and usefulness in a bookmarking app.
 */
export async function scoreQuality(
  judgeClient: InferenceClient,
  content: string,
  tags: string[],
): Promise<ScoreResult> {
  if (tags.length === 0) {
    return {
      score: 0.2,
      passed: false,
      explanation: "No tags generated for content that expected tags",
    };
  }

  const prompt = `You are evaluating the quality of auto-generated tags for a bookmarking app.

Quality here means whether the tags would be genuinely useful later for finding, remembering, and organizing the saved item — not just whether they are technically relevant.

Consider:
- Recall value: Would these tags help a user successfully find this bookmark later?
- Specificity: Are the tags concrete and distinctive rather than vague or generic?
- Usefulness: Do the tags capture meaningful concepts, entities, topics, or intents a user would actually search or browse by?
- Coverage: Do the tags cover the most important retrieval-worthy aspects of the content?
- Redundancy/noise: Are there unnecessary, repetitive, overly broad, or low-value tags?
- Practicality: Would these tags make sense as a durable tagging system in a real bookmarking app?

Scoring guidelines:
- Penalize tags that are overly generic (e.g., "software", "tools", "technology")
- Penalize tags that are overly verbose or phrase-like
- Reward tags that include concrete entities (tools, libraries, product names)
- Reward consistent level of specificity across tags

Content: ${content}

Generated tags: ${tags.join(", ")}

Rate the tag quality on a scale of 1-5:
5 = Excellent tags for future retrieval and organization; specific, useful, distinctive, and high-value
4 = Good tags overall; mostly useful, with only minor issues like slight redundancy or a few generic tags
3 = Mixed quality; some useful tags, but several are too broad, low-value, missing key retrieval cues, or not very practical
2 = Poor quality; few tags would help with future recall or organization, with substantial noise or weak specificity
1 = Very poor quality; tags are generic, redundant, misleading, or largely useless for retrieval

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
        explanation: `Quality judge score: ${parsed.data.score}/5 — ${parsed.data.explanation}`,
      };
    }

    return {
      score: 0.5,
      passed: false,
      explanation: `Quality judge response failed validation: ${response.response.substring(0, 100)}`,
    };
  } catch (e) {
    return {
      score: 0.5,
      passed: false,
      explanation: `Quality judge call failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
