import {
  OpenAIInferenceClient,
  type InferenceClient,
  type OpenAIInferenceConfig,
} from "@karakeep/shared/inference";

import { config } from "./config";

function buildClientConfig(modelName: string): OpenAIInferenceConfig {
  return {
    apiKey: config.OPENAI_API_KEY!,
    baseURL: config.OPENAI_BASE_URL,
    textModel: modelName,
    imageModel: modelName,
    contextLength: config.EVAL_CONTEXT_LENGTH,
    maxOutputTokens: config.EVAL_MAX_OUTPUT_TOKENS,
    useMaxCompletionTokens: false,
    outputSchema: "structured",
  };
}

export function createTagClient(): InferenceClient {
  return new OpenAIInferenceClient(buildClientConfig(config.EVAL_TEXT_MODEL));
}

export function createJudgeClient(): InferenceClient {
  return new OpenAIInferenceClient(buildClientConfig(config.EVAL_JUDGE_MODEL));
}
