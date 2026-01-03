import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnthropicInferenceClient } from "./anthropic";
import { EmbeddingClientFactory, InferenceClientFactory } from "./factory";
import { GoogleEmbeddingClient, GoogleGeminiInferenceClient } from "./google";
import { OllamaEmbeddingClient, OllamaInferenceClient } from "./ollama";
import { OpenAIEmbeddingClient, OpenAIInferenceClient } from "./openai";

// Mock all provider clients to avoid constructing real API clients
vi.mock("./openai", () => ({
  OpenAIInferenceClient: vi.fn(),
  OpenAIEmbeddingClient: vi.fn(),
}));

vi.mock("./anthropic", () => ({
  AnthropicInferenceClient: vi.fn(),
}));

vi.mock("./google", () => ({
  GoogleGeminiInferenceClient: vi.fn(),
  GoogleEmbeddingClient: vi.fn(),
}));

vi.mock("./ollama", () => ({
  OllamaInferenceClient: vi.fn(),
  OllamaEmbeddingClient: vi.fn(),
}));

// Mock serverConfig with proper types
vi.mock("../config", () => ({
  default: {
    inference: {
      provider: "openai" as "openai" | "anthropic" | "google" | "ollama" | null,
    },
    embedding: {
      provider: "openai" as "openai" | "google" | "ollama" | null,
    },
  },
}));

describe("InferenceClientFactory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return OpenAIInferenceClient when provider is openai", async () => {
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.provider = "openai";

    const client = InferenceClientFactory.build();

    expect(client).toBeInstanceOf(OpenAIInferenceClient);
    expect(OpenAIInferenceClient).toHaveBeenCalledTimes(1);
  });

  it("should return AnthropicInferenceClient when provider is anthropic", async () => {
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.provider = "anthropic";

    const client = InferenceClientFactory.build();

    expect(client).toBeInstanceOf(AnthropicInferenceClient);
    expect(AnthropicInferenceClient).toHaveBeenCalledTimes(1);
  });

  it("should return GoogleGeminiInferenceClient when provider is google", async () => {
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.provider = "google";

    const client = InferenceClientFactory.build();

    expect(client).toBeInstanceOf(GoogleGeminiInferenceClient);
    expect(GoogleGeminiInferenceClient).toHaveBeenCalledTimes(1);
  });

  it("should return OllamaInferenceClient when provider is ollama", async () => {
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.provider = "ollama";

    const client = InferenceClientFactory.build();

    expect(client).toBeInstanceOf(OllamaInferenceClient);
    expect(OllamaInferenceClient).toHaveBeenCalledTimes(1);
  });

  it("should return null when provider is not configured", async () => {
    const { default: serverConfig } = await import("../config");
    (serverConfig.inference as { provider: string | null }).provider = null;

    const client = InferenceClientFactory.build();

    expect(client).toBeNull();
  });

  it("should return null for unknown provider", async () => {
    const { default: serverConfig } = await import("../config");
    (serverConfig.inference as { provider: string | null }).provider =
      "unknown";

    const client = InferenceClientFactory.build();

    expect(client).toBeNull();
  });
});

describe("EmbeddingClientFactory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return OpenAIEmbeddingClient when provider is openai", async () => {
    const { default: serverConfig } = await import("../config");
    serverConfig.embedding.provider = "openai";

    const client = EmbeddingClientFactory.build();

    expect(client).toBeInstanceOf(OpenAIEmbeddingClient);
    expect(OpenAIEmbeddingClient).toHaveBeenCalledTimes(1);
  });

  it("should return GoogleEmbeddingClient when provider is google", async () => {
    const { default: serverConfig } = await import("../config");
    serverConfig.embedding.provider = "google";

    const client = EmbeddingClientFactory.build();

    expect(client).toBeInstanceOf(GoogleEmbeddingClient);
    expect(GoogleEmbeddingClient).toHaveBeenCalledTimes(1);
  });

  it("should return OllamaEmbeddingClient when provider is ollama", async () => {
    const { default: serverConfig } = await import("../config");
    serverConfig.embedding.provider = "ollama";

    const client = EmbeddingClientFactory.build();

    expect(client).toBeInstanceOf(OllamaEmbeddingClient);
    expect(OllamaEmbeddingClient).toHaveBeenCalledTimes(1);
  });

  it("should return null when provider is not configured", async () => {
    const { default: serverConfig } = await import("../config");
    (serverConfig.embedding as { provider: string | null }).provider = null;

    const client = EmbeddingClientFactory.build();

    expect(client).toBeNull();
  });

  it("should return null for anthropic (no embedding support)", async () => {
    const { default: serverConfig } = await import("../config");
    (serverConfig.embedding as { provider: string | null }).provider =
      "anthropic";

    const client = EmbeddingClientFactory.build();

    expect(client).toBeNull();
  });
});
