/**
 * Inference Module
 *
 * Provides a unified interface for AI inference and embeddings across multiple providers:
 * - OpenAI (GPT-4, GPT-5, with Chat Completions and Responses API support)
 * - Anthropic (Claude)
 * - Google (Gemini)
 * - Ollama (self-hosted)
 *
 * Usage:
 *   import { InferenceClientFactory, EmbeddingClientFactory } from "@karakeep/shared/inference";
 *
 *   const inferenceClient = InferenceClientFactory.build();
 *   const embeddingClient = EmbeddingClientFactory.build();
 */

// Types
export type {
  InferenceClient,
  EmbeddingClient,
  InferenceResponse,
  EmbeddingResponse,
  InferenceOptions,
} from "./types";

export { defaultInferenceOptions } from "./types";

// Factories (main entry point for most consumers)
export { InferenceClientFactory, EmbeddingClientFactory } from "./factory";

// Individual clients (for advanced usage or testing)
export { OpenAIInferenceClient, OpenAIEmbeddingClient } from "./openai";
export { AnthropicInferenceClient } from "./anthropic";
export { GoogleGeminiInferenceClient, GoogleEmbeddingClient } from "./google";
export { OllamaInferenceClient, OllamaEmbeddingClient } from "./ollama";
