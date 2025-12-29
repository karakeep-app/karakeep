import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  AnthropicInferenceClient,
  supportsStructuredOutputs,
} from "./anthropic";

// Mock the Anthropic SDK
const mockBetaMessagesCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    beta: {
      messages: {
        create: mockBetaMessagesCreate,
      },
    },
  })),
}));

// Mock zod-to-json-schema (used for converting Zod schemas to JSON schema)
vi.mock("zod-to-json-schema", () => ({
  zodToJsonSchema: vi.fn((_schema) => ({
    type: "object",
    properties: { tags: { type: "array" } },
  })),
}));

// Mock serverConfig
vi.mock("../config", () => ({
  default: {
    inference: {
      provider: "anthropic",
      anthropicApiKey: "test-anthropic-key",
      textModel: "claude-sonnet-4-5-20250929",
      imageModel: "claude-sonnet-4-5-20250929",
      maxOutputTokens: 2048,
      outputSchema: "structured",
    },
  },
}));

describe("AnthropicInferenceClient", () => {
  let client: AnthropicInferenceClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new AnthropicInferenceClient();
  });

  describe("inferFromText", () => {
    it("should call beta messages API with correct parameters", async () => {
      mockBetaMessagesCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "test response" }],
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      const result = await client.inferFromText("test prompt", {});

      expect(mockBetaMessagesCreate).toHaveBeenCalledTimes(1);
      expect(result.response).toBe("test response");
      expect(result.totalTokens).toBe(30);
    });

    it("should include structured outputs beta flag when schema is provided", async () => {
      mockBetaMessagesCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: '{"name": "test"}' }],
        usage: { input_tokens: 5, output_tokens: 10 },
      });

      const schema = z.object({ name: z.string() });
      await client.inferFromText("prompt", { schema });

      expect(mockBetaMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          betas: ["structured-outputs-2025-11-13"],
        }),
        expect.any(Object),
      );
    });

    it("should not include betas header when no schema provided", async () => {
      mockBetaMessagesCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "response" }],
        usage: { input_tokens: 5, output_tokens: 10 },
      });

      await client.inferFromText("prompt", {});

      const callArgs = mockBetaMessagesCreate.mock.calls[0][0];
      expect(callArgs.betas).toBeUndefined();
    });

    it("should pass prompt as user message", async () => {
      mockBetaMessagesCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "response" }],
        usage: { input_tokens: 5, output_tokens: 10 },
      });

      await client.inferFromText("my test prompt", {});

      expect(mockBetaMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: "user", content: "my test prompt" }],
        }),
        expect.any(Object),
      );
    });

    it("should include model and max_tokens", async () => {
      mockBetaMessagesCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "response" }],
        usage: { input_tokens: 5, output_tokens: 10 },
      });

      await client.inferFromText("prompt", {});

      expect(mockBetaMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 2048,
        }),
        expect.any(Object),
      );
    });

    it("should include output_format when schema is provided", async () => {
      mockBetaMessagesCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: '{"name": "test"}' }],
        usage: { input_tokens: 5, output_tokens: 10 },
      });

      const schema = z.object({ name: z.string() });
      await client.inferFromText("prompt", { schema });

      expect(mockBetaMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          output_format: expect.objectContaining({
            type: "json_schema",
          }),
        }),
        expect.any(Object),
      );
    });

    it("should throw error when no text content returned", async () => {
      mockBetaMessagesCreate.mockResolvedValueOnce({
        content: [{ type: "tool_use", id: "123", name: "tool", input: {} }],
        usage: { input_tokens: 5, output_tokens: 10 },
      });

      await expect(client.inferFromText("prompt", {})).rejects.toThrow(
        "Got no text content from Anthropic",
      );
    });

    it("should pass abort signal to API call", async () => {
      mockBetaMessagesCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "response" }],
        usage: { input_tokens: 5, output_tokens: 10 },
      });

      const controller = new AbortController();
      await client.inferFromText("prompt", {
        abortSignal: controller.signal,
      });

      expect(mockBetaMessagesCreate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          signal: controller.signal,
        }),
      );
    });
  });

  describe("inferFromImage", () => {
    it("should include image in message content with base64 encoding", async () => {
      mockBetaMessagesCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "image description" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      await client.inferFromImage(
        "describe this image",
        "image/png",
        "base64encodedimage",
        {},
      );

      expect(mockBetaMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: "base64encodedimage",
                  },
                },
                {
                  type: "text",
                  text: "describe this image",
                },
              ],
            },
          ],
        }),
        expect.any(Object),
      );
    });

    it("should return response and token count", async () => {
      mockBetaMessagesCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "A beautiful sunset" }],
        usage: { input_tokens: 150, output_tokens: 30 },
      });

      const result = await client.inferFromImage(
        "describe",
        "image/jpeg",
        "imagedata",
        {},
      );

      expect(result.response).toBe("A beautiful sunset");
      expect(result.totalTokens).toBe(180);
    });

    it("should support different image types", async () => {
      mockBetaMessagesCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "response" }],
        usage: { input_tokens: 100, output_tokens: 20 },
      });

      await client.inferFromImage("describe", "image/webp", "webpdata", {});

      expect(mockBetaMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: "user",
              content: expect.arrayContaining([
                expect.objectContaining({
                  source: expect.objectContaining({
                    media_type: "image/webp",
                  }),
                }),
              ]),
            },
          ],
        }),
        expect.any(Object),
      );
    });
  });
});

describe("AnthropicInferenceClient with plain output", () => {
  let client: AnthropicInferenceClient;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set output schema to plain text
    const { default: serverConfig } = await import("../config");
    serverConfig.inference.outputSchema = "plain";

    client = new AnthropicInferenceClient();
  });

  it("should not include output_format when outputSchema is plain", async () => {
    mockBetaMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "plain response" }],
      usage: { input_tokens: 5, output_tokens: 10 },
    });

    const schema = z.object({ name: z.string() });
    await client.inferFromText("prompt", { schema });

    const callArgs = mockBetaMessagesCreate.mock.calls[0][0];
    expect(callArgs.output_format).toBeUndefined();
  });

  it("should not include betas header when outputSchema is plain", async () => {
    mockBetaMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "plain response" }],
      usage: { input_tokens: 5, output_tokens: 10 },
    });

    await client.inferFromText("prompt", {});

    const callArgs = mockBetaMessagesCreate.mock.calls[0][0];
    expect(callArgs.betas).toBeUndefined();
  });
});

describe("supportsStructuredOutputs", () => {
  it("should return true for Claude Sonnet 4.5 models", () => {
    expect(supportsStructuredOutputs("claude-sonnet-4-5-20250929")).toBe(true);
    expect(supportsStructuredOutputs("claude-sonnet-4-5")).toBe(true);
  });

  it("should return true for Claude Haiku 4.5 models", () => {
    expect(supportsStructuredOutputs("claude-haiku-4-5-20251001")).toBe(true);
    expect(supportsStructuredOutputs("claude-haiku-4-5")).toBe(true);
  });

  it("should return true for Claude Opus 4.5 models", () => {
    expect(supportsStructuredOutputs("claude-opus-4-5-20251101")).toBe(true);
    expect(supportsStructuredOutputs("claude-opus-4-5")).toBe(true);
  });

  it("should return true for Claude Opus 4.1 models", () => {
    expect(supportsStructuredOutputs("claude-opus-4-1-20250415")).toBe(true);
    expect(supportsStructuredOutputs("claude-opus-4-1")).toBe(true);
  });

  it("should return false for older Claude models", () => {
    expect(supportsStructuredOutputs("claude-sonnet-4-20250514")).toBe(false);
    expect(supportsStructuredOutputs("claude-3-5-sonnet-20241022")).toBe(false);
    expect(supportsStructuredOutputs("claude-3-opus-20240229")).toBe(false);
    expect(supportsStructuredOutputs("claude-3-haiku-20240307")).toBe(false);
    expect(supportsStructuredOutputs("claude-2.1")).toBe(false);
  });

  it("should handle edge cases", () => {
    expect(supportsStructuredOutputs("")).toBe(false);
    expect(supportsStructuredOutputs("gpt-4")).toBe(false);
    expect(supportsStructuredOutputs("claude")).toBe(false);
  });
});
