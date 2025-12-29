import type { EmbeddingClient, InferenceClient } from "./types";
import serverConfig from "../config";
import { AnthropicInferenceClient } from "./anthropic";
import { GoogleEmbeddingClient, GoogleGeminiInferenceClient } from "./google";
import { OllamaEmbeddingClient, OllamaInferenceClient } from "./ollama";
import { OpenAIEmbeddingClient, OpenAIInferenceClient } from "./openai";

/**
 * Factory for creating inference clients based on configuration.
 *
 * Supported providers:
 * - openai: OpenAI GPT models (Chat Completions + Responses API)
 * - anthropic: Anthropic Claude models
 * - google: Google Gemini models
 * - ollama: Self-hosted local models
 */
export class InferenceClientFactory {
  static build(): InferenceClient | null {
    const provider = serverConfig.inference.provider;

    switch (provider) {
      case "openai":
        return new OpenAIInferenceClient();
      case "anthropic":
        return new AnthropicInferenceClient();
      case "google":
        return new GoogleGeminiInferenceClient();
      case "ollama":
        return new OllamaInferenceClient();
      default:
        return null;
    }
  }
}

/**
 * Factory for creating embedding clients based on configuration.
 *
 * Supported providers:
 * - openai: OpenAI text-embedding models
 * - google: Google Gemini embedding models
 * - ollama: Self-hosted embedding models
 *
 * Note: Anthropic does not provide embeddings. When using Anthropic for inference,
 * configure a separate embedding provider (openai, google, or ollama).
 */
export class EmbeddingClientFactory {
  static build(): EmbeddingClient | null {
    const provider = serverConfig.embedding.provider;

    switch (provider) {
      case "openai":
        return new OpenAIEmbeddingClient();
      case "google":
        return new GoogleEmbeddingClient();
      case "ollama":
        return new OllamaEmbeddingClient();
      default:
        return null;
    }
  }
}
