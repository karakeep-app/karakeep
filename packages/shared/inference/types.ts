import type { z } from "zod";

export interface InferenceResponse {
  response: string;
  totalTokens: number | undefined;
}

export interface EmbeddingResponse {
  embeddings: number[][];
}

export interface InferenceOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodSchema<any> | null;
  abortSignal?: AbortSignal;
  /**
   * Reasoning effort for OpenAI Responses API.
   * Values: "none" | "minimal" | "low" | "medium" | "high" | "xhigh"
   * - Models before gpt-5.1 (o-series): default "medium", don't support "none"
   * - gpt-5.1: default "none", supports "none" | "low" | "medium" | "high"
   * - gpt-5-pro: only supports "high"
   * - Models after gpt-5.1-codex-max: additionally support "xhigh"
   */
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  previousResponseId?: string;
  store?: boolean;
}

export const defaultInferenceOptions: InferenceOptions = {
  schema: null,
};

export interface InferenceClient {
  inferFromText(
    prompt: string,
    opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse>;
  inferFromImage(
    prompt: string,
    contentType: string,
    image: string,
    opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse>;
}

export interface EmbeddingClient {
  generateEmbeddingFromText(inputs: string[]): Promise<EmbeddingResponse>;
}
