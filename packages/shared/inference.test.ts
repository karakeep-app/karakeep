import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { OpenAIInferenceClient } from "./inference";
import type { OpenAIInferenceConfig } from "./inference";

const capturedBodies: Record<string, unknown>[] = [];
const tagSchema = z.object({ tags: z.array(z.string()) });

vi.mock("openai", () => {
  const OpenAIMock = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(async (body: Record<string, unknown>) => {
          capturedBodies.push(body);
          return {
            choices: [{ message: { content: "{}" } }],
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
    audioModel: "test-audio-model",
    contextLength: 2048,
    maxOutputTokens: 1024,
    useMaxCompletionTokens: false,
    outputSchema,
  };
}

describe("OpenAIInferenceClient response_format", () => {
  beforeEach(() => {
    capturedBodies.length = 0;
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

  it("passes the requested image detail through to the vision call", async () => {
    const client = new OpenAIInferenceClient(makeConfig("plain"));
    await client.inferFromImage("p", "image/jpeg", "AAAA", {
      schema: null,
      imageDetail: "high",
    });
    const body = capturedBodies[capturedBodies.length - 1] as {
      messages: { content: { image_url?: { detail: string } }[] }[];
    };
    const part = body.messages[0].content.find((c) => c.image_url);
    expect(part?.image_url?.detail).toBe("high");
  });

  it("defaults image detail to low", async () => {
    const client = new OpenAIInferenceClient(makeConfig("plain"));
    await client.inferFromImage("p", "image/jpeg", "AAAA", { schema: null });
    const body = capturedBodies[capturedBodies.length - 1] as {
      messages: { content: { image_url?: { detail: string } }[] }[];
    };
    expect(
      body.messages[0].content.find((c) => c.image_url)?.image_url?.detail,
    ).toBe("low");
  });
});
