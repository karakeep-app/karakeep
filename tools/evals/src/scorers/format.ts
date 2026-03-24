import { z } from "zod";

import type { ScoreResult } from "./index";

const tagsSchema = z.object({
  tags: z.array(z.string()),
});

/**
 * Score whether the raw LLM response is valid JSON with a tags array.
 * Returns the parsed tags if successful.
 */
export function scoreFormat(rawResponse: string): {
  score: ScoreResult;
  tags: string[] | null;
} {
  try {
    const parsed = JSON.parse(rawResponse.trim());
    const result = tagsSchema.safeParse(parsed);
    if (result.success) {
      return {
        score: {
          score: 1.0,
          passed: true,
          explanation: "Valid JSON with tags array",
        },
        tags: result.data.tags,
      };
    }
    return {
      score: {
        score: 0.0,
        passed: false,
        explanation: `JSON parsed but schema validation failed: ${result.error.message}`,
      },
      tags: null,
    };
  } catch {
    // Try extracting JSON from markdown code blocks
    const jsonBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i;
    const match = rawResponse.match(jsonBlockRegex);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        const result = tagsSchema.safeParse(parsed);
        if (result.success) {
          return {
            score: {
              score: 0.5,
              passed: false,
              explanation: "Valid JSON but wrapped in markdown code block",
            },
            tags: result.data.tags,
          };
        }
      } catch {
        // Fall through
      }
    }

    // Try finding JSON object in text
    const objectMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0]);
        const result = tagsSchema.safeParse(parsed);
        if (result.success) {
          return {
            score: {
              score: 0.5,
              passed: false,
              explanation: "Valid JSON but embedded in non-JSON text",
            },
            tags: result.data.tags,
          };
        }
      } catch {
        // Fall through
      }
    }

    return {
      score: {
        score: 0.0,
        passed: false,
        explanation: `Failed to parse response as JSON: ${rawResponse.substring(0, 100)}`,
      },
      tags: null,
    };
  }
}
