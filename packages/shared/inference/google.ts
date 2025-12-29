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
 * Google Gemini Inference Client
 *
 * Uses Google's unified Gen AI SDK for text and vision inference.
 * Supports Gemini 2.5 and 3.x models with structured output via JSON schema.
 */
export class GoogleGeminiInferenceClient implements InferenceClient {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: serverConfig.inference.geminiApiKey ?? "",
      ...(serverConfig.inference.geminiBaseUrl && {
        httpOptions: { baseUrl: serverConfig.inference.geminiBaseUrl },
      }),
    });
  }

  async inferFromText(
    prompt: string,
    _opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse> {
    const optsWithDefaults: InferenceOptions = {
      ...defaultInferenceOptions,
      ..._opts,
    };

    // Build generation config
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: serverConfig.inference.maxOutputTokens,
    };

    // Configure response format based on outputSchema setting
    if (serverConfig.inference.outputSchema === "plain") {
      generationConfig.responseMimeType = "text/plain";
    } else {
      generationConfig.responseMimeType = "application/json";

      // If a Zod schema is provided, convert it to JSON schema for structured output
      if (optsWithDefaults.schema) {
        generationConfig.responseJsonSchema = zodToJsonSchema(
          optsWithDefaults.schema,
          { $refStrategy: "none" },
        );
      }
    }

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

    // Build generation config
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: serverConfig.inference.maxOutputTokens,
    };

    // Configure response format based on outputSchema setting
    if (serverConfig.inference.outputSchema === "plain") {
      generationConfig.responseMimeType = "text/plain";
    } else {
      generationConfig.responseMimeType = "application/json";

      // If a Zod schema is provided, convert it to JSON schema for structured output
      if (optsWithDefaults.schema) {
        generationConfig.responseJsonSchema = zodToJsonSchema(
          optsWithDefaults.schema,
          { $refStrategy: "none" },
        );
      }
    }

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
 */
export class GoogleEmbeddingClient implements EmbeddingClient {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: serverConfig.inference.geminiApiKey ?? "",
      ...(serverConfig.inference.geminiBaseUrl && {
        httpOptions: { baseUrl: serverConfig.inference.geminiBaseUrl },
      }),
    });
  }

  async generateEmbeddingFromText(
    inputs: string[],
  ): Promise<EmbeddingResponse> {
    // Batch embedding - pass all inputs at once for efficiency
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
