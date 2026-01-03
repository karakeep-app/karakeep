import { GoogleGenAI, Type } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";

import type {
  EmbeddingClient,
  EmbeddingResponse,
  InferenceClient,
  InferenceOptions,
  InferenceResponse,
} from "./types";
import serverConfig from "../config";
import { defaultInferenceOptions } from "./types";

/**
 * Maximum number of texts per batch for Google's embedding API.
 */
const EMBEDDING_BATCH_SIZE = 100;

/**
 * Build generation config for Gemini API requests.
 * Handles output format (plain text, JSON, or structured JSON schema).
 */
function buildGenerationConfig(
  opts: InferenceOptions,
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    maxOutputTokens: serverConfig.inference.maxOutputTokens,
  };

  // Configure response format based on outputSchema setting
  if (serverConfig.inference.outputSchema === "plain") {
    config.responseMimeType = "text/plain";
  } else {
    config.responseMimeType = "application/json";

    // If a Zod schema is provided, convert it to JSON schema for structured output
    if (opts.schema) {
      config.responseJsonSchema = zodToJsonSchema(opts.schema, {
        $refStrategy: "none",
      });
    }
  }

  return config;
}

/**
 * Create a GoogleGenAI client instance.
 * Validates API key and applies base URL if configured.
 */
function createGoogleClient(): GoogleGenAI {
  const apiKey = serverConfig.inference.geminiApiKey;
  if (!apiKey) {
    throw new Error(
      "Gemini API key is not configured. Set GEMINI_API_KEY environment variable.",
    );
  }

  return new GoogleGenAI({
    apiKey,
    ...(serverConfig.inference.geminiBaseUrl && {
      httpOptions: { baseUrl: serverConfig.inference.geminiBaseUrl },
    }),
  });
}

/**
 * Google Gemini Inference Client
 *
 * Uses Google's unified Gen AI SDK for text and vision inference.
 * Supports Gemini 2.5 and 3.x models with structured output via JSON schema.
 */
export class GoogleGeminiInferenceClient implements InferenceClient {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = createGoogleClient();
  }

  async inferFromText(
    prompt: string,
    _opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse> {
    const optsWithDefaults: InferenceOptions = {
      ...defaultInferenceOptions,
      ..._opts,
    };

    const generationConfig = buildGenerationConfig(optsWithDefaults);

    const result = await this.ai.models.generateContent({
      model: serverConfig.inference.textModel,
      contents: prompt,
      config: {
        ...generationConfig,
        abortSignal: optsWithDefaults.abortSignal,
      },
    });

    const response = result.text;
    if (!response) {
      throw new Error("Got no text content from Google Gemini");
    }

    const totalTokens =
      (result.usageMetadata?.promptTokenCount ?? 0) +
      (result.usageMetadata?.candidatesTokenCount ?? 0);

    return { response, totalTokens };
  }

  async inferFromImage(
    prompt: string,
    contentType: string,
    image: string,
    _opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse> {
    const optsWithDefaults: InferenceOptions = {
      ...defaultInferenceOptions,
      ..._opts,
    };

    const generationConfig = buildGenerationConfig(optsWithDefaults);

    const result = await this.ai.models.generateContent({
      model: serverConfig.inference.imageModel,
      contents: [
        {
          inlineData: {
            mimeType: contentType,
            data: image,
          },
        },
        prompt,
      ],
      config: {
        ...generationConfig,
        abortSignal: optsWithDefaults.abortSignal,
      },
    });

    const response = result.text;
    if (!response) {
      throw new Error("Got no text content from Google Gemini");
    }

    const totalTokens =
      (result.usageMetadata?.promptTokenCount ?? 0) +
      (result.usageMetadata?.candidatesTokenCount ?? 0);

    return { response, totalTokens };
  }
}

/**
 * Google Gemini Embedding Client
 *
 * Uses Google's unified Gen AI SDK for text embeddings.
 * Recommended model: gemini-embedding-001 (3072 dimensions, supports 128-3072).
 * Handles batching automatically for inputs larger than 100 texts.
 */
export class GoogleEmbeddingClient implements EmbeddingClient {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = createGoogleClient();
  }

  async generateEmbeddingFromText(
    inputs: string[],
  ): Promise<EmbeddingResponse> {
    // Google's embedding API has a limit of 100 texts per batch
    // Process in chunks if necessary
    if (inputs.length <= EMBEDDING_BATCH_SIZE) {
      return this.embedBatch(inputs);
    }

    // Process in batches and combine results
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < inputs.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = inputs.slice(i, i + EMBEDDING_BATCH_SIZE);
      const result = await this.embedBatch(batch);
      allEmbeddings.push(...result.embeddings);
    }

    return { embeddings: allEmbeddings };
  }

  private async embedBatch(inputs: string[]): Promise<EmbeddingResponse> {
    const result = await this.ai.models.embedContent({
      model: serverConfig.embedding.textModel,
      contents: inputs,
    });

    const embeddings = (result.embeddings ?? []).map((e) => e.values ?? []);

    return { embeddings };
  }
}

// Re-export Type enum for use in schema definitions if needed
export { Type as GeminiSchemaType };
