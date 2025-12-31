import type { InferenceClient } from "@karakeep/shared/inference";
import {
  OpenAIInferenceClient,
  type OpenAIInferenceConfig,
} from "@karakeep/shared/inference";
import { z } from "zod";

import { config } from "./config";

export function createInferenceClient(modelName: string): InferenceClient {
  const inferenceConfig: OpenAIInferenceConfig = {
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_BASE_URL,
    textModel: modelName,
    imageModel: modelName, // Use same model for images if needed
    contextLength: config.INFERENCE_CONTEXT_LENGTH,
    maxOutputTokens: config.INFERENCE_MAX_OUTPUT_TOKENS,
    useMaxCompletionTokens: config.INFERENCE_USE_MAX_COMPLETION_TOKENS,
    outputSchema: "structured",
  };

  return new OpenAIInferenceClient(inferenceConfig);
}

export async function inferTags(
  inferenceClient: InferenceClient,
  prompt: string,
): Promise<string[]> {
  const tagsSchema = z.object({
    tags: z.array(z.string()),
  });

  const response = await inferenceClient.inferFromText(prompt, {
    schema: tagsSchema,
  });

  const parsed = tagsSchema.safeParse(JSON.parse(response.response));
  if (!parsed.success) {
    throw new Error(
      `Failed to parse model response: ${parsed.error.message}`,
    );
  }

  return parsed.data.tags;
}
