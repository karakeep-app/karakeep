import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { OpenAIInferenceClient } from "./inference";
import type { OpenAIInferenceConfig } from "./inference";

const capturedBodies: Record<string, unknown>[] = [];
const mockCompletion: { content: string | null } = { content: "{}" };
const tagSchema = z.object({ tags: z.array(z.string()) });

vi.mock("openai", () => {
  const OpenAIMock = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(async (body: Record<string, unknown>) => {
          capturedBodies.push(body);
          return {
            choices: [{ message: { content: mockCompletion.content } }],
            usage: { total_tokens: 1 },
          };
        }),
      },
    },
  }));

  return { default: OpenAIMock };
});

vi.mock("openai/helpers/zod", () => ({
  zodResponseFormat: (schema: unknown, name: string) => ({
    type: "json_schema",
    json_schema: { name, schema },
  }),
}));

function makeConfig(
  outputSchema: OpenAIInferenceConfig["outputSchema"],
): OpenAIInferenceConfig {
  return {
    apiKey: "test-key",
    textModel: "test-text-model",
    imageModel: "test-image-model",
    contextLength: 2048,
    maxOutputTokens: 1024,
    useMaxCompletionTokens: false,
    outputSchema,
  };
}

describe("OpenAIInferenceClient response_format", () => {
  beforeEach(() => {
    capturedBodies.length = 0;
    mockCompletion.content = "{}";
  });

  it("omits response_format for schema-less text inference in json mode", async () => {
    const client = new OpenAIInferenceClient(makeConfig("json"));

    await client.inferFromText("summarize this text", { schema: null });

    expect(capturedBodies).toHaveLength(1);
    expect(capturedBodies[0].response_format).toBeUndefined();
  });

  it("keeps json_object for schema-backed text inference in json mode", async () => {
    const client = new OpenAIInferenceClient(makeConfig("json"));

    await client.inferFromText("infer tags as json", { schema: tagSchema });

    expect(capturedBodies).toHaveLength(1);
    expect(capturedBodies[0].response_format).toEqual({ type: "json_object" });
  });

  it("omits response_format for schema-less image inference in json mode", async () => {
    const client = new OpenAIInferenceClient(makeConfig("json"));

    await client.inferFromImage("describe this image", "image/png", "BASE64", {
      schema: null,
    });

    expect(capturedBodies).toHaveLength(1);
    expect(capturedBodies[0].response_format).toBeUndefined();
  });

  it("keeps structured response_format for schema-backed text inference in structured mode", async () => {
    const client = new OpenAIInferenceClient(makeConfig("structured"));

    await client.inferFromText("infer tags", { schema: tagSchema });

    expect(capturedBodies).toHaveLength(1);
    expect(capturedBodies[0].response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "schema" },
    });
  });
});

describe("OpenAIInferenceClient reasoning tags", () => {
  beforeEach(() => {
    capturedBodies.length = 0;
    mockCompletion.content = "{}";
  });

  it("strips a complete think block from a text response", async () => {
    const client = new OpenAIInferenceClient(makeConfig("plain"));
    mockCompletion.content =
      "<think>Let me extract the key points first.</think>\n\nReal summary.";

    const result = await client.inferFromText("summarize this text", {
      schema: null,
    });

    expect(result.response).toBe("Real summary.");
  });

  it("strips the preamble when the provider only emits a closing tag", async () => {
    const client = new OpenAIInferenceClient(makeConfig("plain"));
    mockCompletion.content =
      "Let me extract the key points first.</think>\n\nReal summary.";

    const result = await client.inferFromText("summarize this text", {
      schema: null,
    });

    expect(result.response).toBe("Real summary.");
  });

  it("strips a complete think block from an image response", async () => {
    const client = new OpenAIInferenceClient(makeConfig("plain"));
    mockCompletion.content =
      "<thinking>This looks like a cat.</thinking>A cat on a sofa.";

    const result = await client.inferFromImage(
      "describe this image",
      "image/png",
      "BASE64",
      { schema: null },
    );

    expect(result.response).toBe("A cat on a sofa.");
  });

  it("leaves a response without reasoning tags untouched", async () => {
    const client = new OpenAIInferenceClient(makeConfig("plain"));
    mockCompletion.content = "Real summary. It mentions <thinks> in passing.";

    const result = await client.inferFromText("summarize this text", {
      schema: null,
    });

    expect(result.response).toBe(
      "Real summary. It mentions <thinks> in passing.",
    );
  });

  it("leaves a json response untouched", async () => {
    const client = new OpenAIInferenceClient(makeConfig("json"));
    mockCompletion.content = '{"tags":["cooking","recipes"]}';

    const result = await client.inferFromText("infer tags as json", {
      schema: tagSchema,
    });

    expect(result.response).toBe('{"tags":["cooking","recipes"]}');
  });

  it("throws when the response is nothing but reasoning", async () => {
    const client = new OpenAIInferenceClient(makeConfig("plain"));
    mockCompletion.content = "<think>I have no idea what to say.</think>";

    await expect(
      client.inferFromText("summarize this text", { schema: null }),
    ).rejects.toThrow("Got no message content from OpenAI");
  });
});
