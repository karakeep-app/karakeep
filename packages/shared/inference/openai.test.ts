import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { OpenAIEmbeddingClient, OpenAIInferenceClient } from "./openai";

// Mock the OpenAI SDK
const mockChatCompletionsCreate = vi.fn();
const mockResponsesCreate = vi.fn();
const mockEmbeddingsCreate = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockChatCompletionsCreate,
      },
    },
    responses: {
      create: mockResponsesCreate,
    },
    embeddings: {
      create: mockEmbeddingsCreate,
    },
  })),
}));

// Mock serverConfig
vi.mock("../config", () => ({
  default: {
    inference: {
      provider: "openai",
      openAIApiKey: "test-api-key",
      openAIBaseUrl: undefined,
      openAIProxyUrl: undefined,
      openaiUseResponsesApi: false,
      openaiReasoningEffort: "low",
      textModel: "gpt-4o-mini",
      imageModel: "gpt-4o-mini",
      maxOutputTokens: 2048,
      outputSchema: "structured",
    },
    embedding: {
      provider: "openai",
      textModel: "text-embedding-3-small",
    },
  },
}));

describe("OpenAIInferenceClient", () => {
  let client: OpenAIInferenceClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new OpenAIInferenceClient();
  });

  describe("inferFromText", () => {
    it("should use Chat Completions API by default", async () => {
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{ message: { content: "test response" } }],
        usage: { total_tokens: 100 },
      });

      const result = await client.inferFromText("test prompt", {});

      expect(mockChatCompletionsCreate).toHaveBeenCalledTimes(1);
      expect(mockResponsesCreate).not.toHaveBeenCalled();
      expect(result.response).toBe("test response");
      expect(result.totalTokens).toBe(100);
    });

    it("should pass prompt as user message", async () => {
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{ message: { content: "response" } }],
        usage: { total_tokens: 50 },
      });

      await client.inferFromText("my prompt", {});

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: "user", content: "my prompt" }],
        }),
        expect.any(Object),
      );
    });

    it("should include model and max_tokens in request", async () => {
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{ message: { content: "response" } }],
        usage: { total_tokens: 50 },
      });

      await client.inferFromText("prompt", {});

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4o-mini",
          max_tokens: 2048,
        }),
        expect.any(Object),
      );
    });

    it("should use structured output format when schema is provided", async () => {
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"name": "test"}' } }],
        usage: { total_tokens: 50 },
      });

      const schema = z.object({ name: z.string() });
      await client.inferFromText("prompt", { schema });

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: expect.objectContaining({
            type: "json_schema",
          }),
        }),
        expect.any(Object),
      );
    });

    it("should throw error when no message content returned", async () => {
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null } }],
        usage: { total_tokens: 50 },
      });

      await expect(client.inferFromText("prompt", {})).rejects.toThrow(
        "Got no message content from OpenAI Chat Completions",
      );
    });

    it("should pass abort signal to API call", async () => {
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{ message: { content: "response" } }],
        usage: { total_tokens: 50 },
      });

      const controller = new AbortController();
      await client.inferFromText("prompt", {
        abortSignal: controller.signal,
      });

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          signal: controller.signal,
        }),
      );
    });
  });

  describe("inferFromImage", () => {
    it("should include image in message content", async () => {
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{ message: { content: "image description" } }],
        usage: { total_tokens: 150 },
      });

      await client.inferFromImage(
        "describe this image",
        "image/png",
        "base64encodedimage",
        {},
      );

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "describe this image" },
                {
                  type: "image_url",
                  image_url: {
                    url: "data:image/png;base64,base64encodedimage",
                    detail: "low",
                  },
                },
              ],
            },
          ],
        }),
        expect.any(Object),
      );
    });

    it("should return response and token count", async () => {
      mockChatCompletionsCreate.mockResolvedValueOnce({
        choices: [{ message: { content: "A cat sitting on a table" } }],
        usage: { total_tokens: 200 },
      });

      const result = await client.inferFromImage(
        "describe",
        "image/jpeg",
        "imagedata",
        {},
      );

      expect(result.response).toBe("A cat sitting on a table");
      expect(result.totalTokens).toBe(200);
    });
  });
});

describe("OpenAIInferenceClient with Responses API", () => {
  let client: OpenAIInferenceClient;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Enable Responses API for GPT-5 models
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.openaiUseResponsesApi = true;
    serverConfig.inference.textModel = "gpt-5-mini";
    serverConfig.inference.imageModel = "gpt-5-mini";

    client = new OpenAIInferenceClient();
  });

  afterEach(async () => {
    // Restore original config values to prevent test pollution
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.openaiUseResponsesApi = false;
    serverConfig.inference.textModel = "gpt-4o-mini";
    serverConfig.inference.imageModel = "gpt-4o-mini";
  });

  it("should use Responses API for GPT-5 models when enabled", async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      output_text: "response from responses api",
      usage: { total_tokens: 100 },
    });

    const result = await client.inferFromText("test prompt", {});

    expect(mockResponsesCreate).toHaveBeenCalledTimes(1);
    expect(mockChatCompletionsCreate).not.toHaveBeenCalled();
    expect(result.response).toBe("response from responses api");
  });

  it("should include reasoning effort for GPT-5 models", async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      output_text: "response",
      usage: { total_tokens: 100 },
    });

    await client.inferFromText("prompt", { reasoningEffort: "high" });

    expect(mockResponsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning: { effort: "high" },
      }),
      expect.any(Object),
    );
  });
});

describe("OpenAIInferenceClient with json output", () => {
  let client: OpenAIInferenceClient;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set output schema to json
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.outputSchema = "json";
    serverConfig.inference.openaiUseResponsesApi = false;
    serverConfig.inference.textModel = "gpt-4o-mini";

    client = new OpenAIInferenceClient();
  });

  afterEach(async () => {
    // Restore original config values to prevent test pollution
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.outputSchema = "structured";
  });

  it("should use json_object format when outputSchema is json", async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"tags": ["test"]}' } }],
      usage: { total_tokens: 50 },
    });

    const schema = z.object({ tags: z.array(z.string()) });
    await client.inferFromText("prompt", { schema });

    expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: { type: "json_object" },
      }),
      expect.any(Object),
    );
  });

  it("should return JSON response as-is in json mode", async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"tags": ["ai", "ml"]}' } }],
      usage: { total_tokens: 50 },
    });

    const schema = z.object({ tags: z.array(z.string()) });
    const result = await client.inferFromText("prompt", { schema });

    // Chat Completions returns response as-is (no normalization)
    expect(result.response).toBe('{"tags": ["ai", "ml"]}');
  });
});

describe("OpenAIInferenceClient with plain output", () => {
  let client: OpenAIInferenceClient;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set output schema to plain
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.outputSchema = "plain";
    serverConfig.inference.openaiUseResponsesApi = false;
    serverConfig.inference.textModel = "gpt-4o-mini";

    client = new OpenAIInferenceClient();
  });

  afterEach(async () => {
    // Restore original config values to prevent test pollution
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.outputSchema = "structured";
  });

  it("should not set response_format when outputSchema is plain", async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "plain text response" } }],
      usage: { total_tokens: 50 },
    });

    const schema = z.object({ tags: z.array(z.string()) });
    await client.inferFromText("prompt", { schema });

    expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: undefined,
      }),
      expect.any(Object),
    );
  });

  it("should return raw text without JSON parsing in plain mode", async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "This is plain text, not JSON" } }],
      usage: { total_tokens: 50 },
    });

    const result = await client.inferFromText("prompt", {});

    expect(result.response).toBe("This is plain text, not JSON");
  });
});

describe("OpenAIEmbeddingClient", () => {
  let client: OpenAIEmbeddingClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new OpenAIEmbeddingClient();
  });

  it("should generate embeddings for text inputs", async () => {
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: [0.1, 0.2, 0.3] }, { embedding: [0.4, 0.5, 0.6] }],
    });

    const result = await client.generateEmbeddingFromText(["hello", "world"]);

    expect(result.embeddings).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
  });

  it("should use configured embedding model", async () => {
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: [0.1] }],
    });

    await client.generateEmbeddingFromText(["test"]);

    expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: ["test"],
    });
  });
});
