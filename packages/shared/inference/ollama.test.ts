import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { OllamaEmbeddingClient, OllamaInferenceClient } from "./ollama";

// Mock chat response generator for streaming
async function* mockChatStream(
  parts: {
    message: { content: string };
    eval_count?: number;
    prompt_eval_count?: number;
  }[],
) {
  for (const part of parts) {
    yield part;
  }
}

// Mock Ollama SDK
const mockChat = vi.fn();
const mockEmbed = vi.fn();
const mockAbort = vi.fn();

vi.mock("ollama", () => ({
  Ollama: vi.fn().mockImplementation(() => ({
    chat: mockChat,
    embed: mockEmbed,
    abort: mockAbort,
  })),
}));

// Mock customFetch
vi.mock("../customFetch", () => ({
  customFetch: vi.fn(),
}));

// Mock logger
vi.mock("../logger", () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock serverConfig
vi.mock("../config", () => ({
  default: {
    inference: {
      provider: "ollama",
      ollamaBaseUrl: "http://localhost:11434",
      ollamaKeepAlive: "5m",
      textModel: "gemma3",
      imageModel: "llava",
      maxOutputTokens: 2048,
      contextLength: 4096,
      outputSchema: "structured",
    },
    embedding: {
      provider: "ollama",
      textModel: "nomic-embed-text",
    },
  },
}));

describe("OllamaInferenceClient", () => {
  let client: OllamaInferenceClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new OllamaInferenceClient();
  });

  describe("inferFromText", () => {
    it("should call chat with correct parameters", async () => {
      mockChat.mockReturnValueOnce(
        mockChatStream([
          {
            message: { content: "Hello " },
            eval_count: 5,
            prompt_eval_count: 10,
          },
          {
            message: { content: "world!" },
            eval_count: 5,
            prompt_eval_count: 0,
          },
        ]),
      );

      const result = await client.inferFromText("test prompt", {});

      expect(mockChat).toHaveBeenCalledTimes(1);
      expect(result.response).toBe("Hello world!");
      expect(result.totalTokens).toBe(20);
    });

    it("should pass prompt as user message", async () => {
      mockChat.mockReturnValueOnce(
        mockChatStream([{ message: { content: "response" } }]),
      );

      await client.inferFromText("my test prompt", {});

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: "user", content: "my test prompt", images: undefined },
          ],
        }),
      );
    });

    it("should use configured model", async () => {
      mockChat.mockReturnValueOnce(
        mockChatStream([{ message: { content: "response" } }]),
      );

      await client.inferFromText("prompt", {});

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemma3",
        }),
      );
    });

    it("should set streaming to true", async () => {
      mockChat.mockReturnValueOnce(
        mockChatStream([{ message: { content: "response" } }]),
      );

      await client.inferFromText("prompt", {});

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true,
        }),
      );
    });

    it("should include context length and max tokens in options", async () => {
      mockChat.mockReturnValueOnce(
        mockChatStream([{ message: { content: "response" } }]),
      );

      await client.inferFromText("prompt", {});

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            num_ctx: 4096,
            num_predict: 2048,
          },
        }),
      );
    });

    it("should include JSON schema format when schema is provided", async () => {
      mockChat.mockReturnValueOnce(
        mockChatStream([{ message: { content: '{"name": "test"}' } }]),
      );

      const schema = z.object({ name: z.string() });
      await client.inferFromText("prompt", { schema });

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          format: expect.objectContaining({
            type: "object",
            properties: expect.objectContaining({
              name: expect.objectContaining({ type: "string" }),
            }),
          }),
        }),
      );
    });

    it("should include keep_alive setting", async () => {
      mockChat.mockReturnValueOnce(
        mockChatStream([{ message: { content: "response" } }]),
      );

      await client.inferFromText("prompt", {});

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          keep_alive: "5m",
        }),
      );
    });

    it("should accumulate tokens from stream", async () => {
      mockChat.mockReturnValueOnce(
        mockChatStream([
          { message: { content: "a" }, eval_count: 10, prompt_eval_count: 50 },
          { message: { content: "b" }, eval_count: 20, prompt_eval_count: 0 },
          { message: { content: "c" }, eval_count: 5, prompt_eval_count: 0 },
        ]),
      );

      const result = await client.inferFromText("prompt", {});

      expect(result.response).toBe("abc");
      expect(result.totalTokens).toBe(85);
    });
  });

  describe("inferFromImage", () => {
    it("should include image in message", async () => {
      mockChat.mockReturnValueOnce(
        mockChatStream([{ message: { content: "image description" } }]),
      );

      await client.inferFromImage(
        "describe this image",
        "image/png",
        "base64encodedimage",
        {},
      );

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: "user",
              content: "describe this image",
              images: ["base64encodedimage"],
            },
          ],
        }),
      );
    });

    it("should use image model", async () => {
      mockChat.mockReturnValueOnce(
        mockChatStream([{ message: { content: "response" } }]),
      );

      await client.inferFromImage("describe", "image/jpeg", "imagedata", {});

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "llava",
        }),
      );
    });
  });
});

describe("OllamaInferenceClient with JSON output", () => {
  let client: OllamaInferenceClient;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set output schema to json (not structured)
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.outputSchema = "json";

    client = new OllamaInferenceClient();
  });

  afterEach(async () => {
    // Restore original config value to prevent test pollution
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.outputSchema = "structured";
  });

  it("should use 'json' format string when outputSchema is json", async () => {
    mockChat.mockReturnValueOnce(
      mockChatStream([{ message: { content: '{"result": true}' } }]),
    );

    await client.inferFromText("prompt", {});

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "json",
      }),
    );
  });
});

describe("OllamaInferenceClient with plain output", () => {
  let client: OllamaInferenceClient;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set output schema to plain
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.outputSchema = "plain";

    client = new OllamaInferenceClient();
  });

  afterEach(async () => {
    // Restore original config value to prevent test pollution
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.outputSchema = "structured";
  });

  it("should not set format when outputSchema is plain", async () => {
    mockChat.mockReturnValueOnce(
      mockChatStream([{ message: { content: "plain text response" } }]),
    );

    const schema = z.object({ name: z.string() });
    await client.inferFromText("prompt", { schema });

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        format: undefined,
      }),
    );
  });
});

describe("OllamaEmbeddingClient", () => {
  let client: OllamaEmbeddingClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new OllamaEmbeddingClient();
  });

  it("should generate embeddings for text inputs", async () => {
    mockEmbed.mockResolvedValueOnce({
      embeddings: [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ],
    });

    const result = await client.generateEmbeddingFromText(["hello", "world"]);

    expect(result.embeddings).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
  });

  it("should use configured embedding model", async () => {
    mockEmbed.mockResolvedValueOnce({
      embeddings: [[0.1]],
    });

    await client.generateEmbeddingFromText(["test"]);

    expect(mockEmbed).toHaveBeenCalledWith({
      model: "nomic-embed-text",
      input: ["test"],
      truncate: true,
    });
  });

  it("should pass all inputs in a single request", async () => {
    mockEmbed.mockResolvedValueOnce({
      embeddings: [[0.1], [0.2], [0.3]],
    });

    await client.generateEmbeddingFromText(["a", "b", "c"]);

    expect(mockEmbed).toHaveBeenCalledTimes(1);
    expect(mockEmbed).toHaveBeenCalledWith({
      model: "nomic-embed-text",
      input: ["a", "b", "c"],
      truncate: true,
    });
  });
});
