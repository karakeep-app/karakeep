import { z } from "zod";

import type { InferenceClient } from "@karakeep/shared/inference";

import type { ScoreResult } from "./index";

const judgeResponseSchema = z.object({
  fraction_correct: z.number().min(0).max(1),
  explanation: z.string(),
});

/**
 * Use an LLM judge to verify tags are in the requested language.
 */
export async function scoreLanguage(
  judgeClient: InferenceClient,
  tags: string[],
  expectedLang: string,
): Promise<ScoreResult> {
  if (tags.length === 0) {
    return {
      score: 1.0,
      passed: true,
      explanation: "No tags to check language for",
    };
  }

  const prompt = `You are a language detection expert. Determine what fraction of the following tags are written in ${expectedLang}.

Tags: ${tags.map((t) => `"${t}"`).join(", ")}

Rules:
- Proper nouns (brand names, place names, technical terms) that are universally written in English are acceptable and count as correct.
- Abbreviations and acronyms are acceptable.
- Only flag tags that are clearly in a different language than ${expectedLang}.

Respond in JSON: {"fraction_correct": <0.0 to 1.0>, "explanation": "<brief reason>"}`;

  try {
    const response = await judgeClient.inferFromText(prompt, {
      schema: judgeResponseSchema,
    });
    const parsed = judgeResponseSchema.safeParse(
      JSON.parse(response.response.trim()),
    );

    if (parsed.success) {
      return {
        score: parsed.data.fraction_correct,
        passed: parsed.data.fraction_correct >= 0.8,
        explanation: `Language check (${expectedLang}): ${parsed.data.fraction_correct * 100}% correct — ${parsed.data.explanation}`,
      };
    }

    return {
      score: 0.5,
      passed: false,
      explanation: `Language judge response failed validation: ${response.response.substring(0, 100)}`,
    };
  } catch (e) {
    return {
      score: 0.5,
      passed: false,
      explanation: `Language judge call failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
