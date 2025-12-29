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
  // Responses API specific options (OpenAI GPT-5+)
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
