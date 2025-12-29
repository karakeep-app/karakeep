import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { GoogleEmbeddingClient, GoogleGeminiInferenceClient } from "./google";

// Mock the Google Gen AI SDK
const mockGenerateContent = vi.fn();
const mockEmbedContent = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
      embedContent: mockEmbedContent,
    },
  })),
  Type: {
    STRING: "STRING",
    NUMBER: "NUMBER",
    OBJECT: "OBJECT",
    ARRAY: "ARRAY",
    BOOLEAN: "BOOLEAN",
  },
}));

// Mock serverConfig
vi.mock("../config", () => ({
  default: {
    inference: {
      provider: "google",
      geminiApiKey: "test-gemini-key",
      textModel: "gemini-2.5-flash",
      imageModel: "gemini-2.5-flash",
      maxOutputTokens: 2048,
      outputSchema: "structured",
    },
    embedding: {
      provider: "google",
      textModel: "text-embedding-004",
    },
  },
}));

describe("GoogleGeminiInferenceClient", () => {
  let client: GoogleGeminiInferenceClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GoogleGeminiInferenceClient();
  });

  describe("inferFromText", () => {
    it("should call generateContent with correct parameters", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: "test response",
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
      });

      const result = await client.inferFromText("test prompt", {});

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(result.response).toBe("test response");
      expect(result.totalTokens).toBe(30);
    });

    it("should pass prompt as contents", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: "response",
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 },
      });

      await client.inferFromText("my test prompt", {});

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: "my test prompt",
        }),
      );
    });

    it("should include model in request", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: "response",
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 },
      });

      await client.inferFromText("prompt", {});

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-2.5-flash",
        }),
      );
    });

    it("should set JSON response format with maxOutputTokens", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: '{"name": "test"}',
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 },
      });

      await client.inferFromText("prompt", {});

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
          }),
        }),
      );
    });

    it("should include JSON schema when schema is provided", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: '{"name": "test"}',
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 },
      });

      const schema = z.object({ name: z.string() });
      await client.inferFromText("prompt", { schema });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            responseJsonSchema: expect.objectContaining({
              type: "object",
              properties: expect.objectContaining({
                name: expect.objectContaining({ type: "string" }),
              }),
            }),
          }),
        }),
      );
    });

    it("should throw error when no text content returned", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: null,
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 0 },
      });

      await expect(client.inferFromText("prompt", {})).rejects.toThrow(
        "Got no text content from Google Gemini",
      );
    });

    it("should pass abort signal in config", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: "response",
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 },
      });

      const controller = new AbortController();
      await client.inferFromText("prompt", {
        abortSignal: controller.signal,
      });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            abortSignal: controller.signal,
          }),
        }),
      );
    });
  });

  describe("inferFromImage", () => {
    it("should include image as inline data", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: "image description",
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
      });

      await client.inferFromImage(
        "describe this image",
        "image/png",
        "base64encodedimage",
        {},
      );

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            {
              inlineData: {
                mimeType: "image/png",
                data: "base64encodedimage",
              },
            },
            "describe this image",
          ],
        }),
      );
    });

    it("should return response and token count", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: "A colorful parrot",
        usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 30 },
      });

      const result = await client.inferFromImage(
        "describe",
        "image/jpeg",
        "imagedata",
        {},
      );

      expect(result.response).toBe("A colorful parrot");
      expect(result.totalTokens).toBe(180);
    });

    it("should handle missing usage metadata gracefully", async () => {
      mockGenerateContent.mockResolvedValueOnce({
        text: "response",
        usageMetadata: undefined,
      });

      const result = await client.inferFromImage(
        "describe",
        "image/jpeg",
        "data",
        {},
      );

      expect(result.totalTokens).toBe(0);
    });
  });
});

describe("GoogleGeminiInferenceClient with plain output", () => {
  let client: GoogleGeminiInferenceClient;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set output schema to plain text
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.outputSchema = "plain";

    client = new GoogleGeminiInferenceClient();
  });

  afterEach(async () => {
    // Restore original config value to prevent test pollution
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.outputSchema = "structured";
  });

  it("should use text/plain mime type when outputSchema is plain", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: "plain text response",
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 },
    });

    await client.inferFromText("prompt", {});

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          responseMimeType: "text/plain",
        }),
      }),
    );
  });
});

describe("GoogleEmbeddingClient", () => {
  let client: GoogleEmbeddingClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GoogleEmbeddingClient();
  });

  it("should generate embeddings for text inputs in batch", async () => {
    // Mock single batch call returning multiple embeddings
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [0.1, 0.2, 0.3] }, { values: [0.4, 0.5, 0.6] }],
    });

    const result = await client.generateEmbeddingFromText(["hello", "world"]);

    expect(mockEmbedContent).toHaveBeenCalledTimes(1);
    expect(result.embeddings).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
  });

  it("should pass all inputs in a single batch request", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [0.1] }, { values: [0.2] }, { values: [0.3] }],
    });

    await client.generateEmbeddingFromText(["a", "b", "c"]);

    expect(mockEmbedContent).toHaveBeenCalledTimes(1);
    expect(mockEmbedContent).toHaveBeenCalledWith({
      model: "text-embedding-004",
      contents: ["a", "b", "c"],
    });
  });

  it("should handle empty embeddings array", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [],
    });

    const result = await client.generateEmbeddingFromText(["test"]);

    expect(result.embeddings).toEqual([]);
  });
});
