import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { OpenAIInferenceClient } from "./inference";

const tagSchema = z.object({ tags: z.array(z.string()) });

interface CapturedCall {
  body: Record<string, unknown>;
}

const captured: CapturedCall[] = [];

vi.mock("openai", () => {
  const OpenAIMock = vi.fn().mockImplementation(function (this: unknown) {
    return {
      chat: {
        completions: {
          create: vi.fn(async (body: Record<string, unknown>) => {
            captured.push({ body });
            return {
              choices: [{ message: { content: "{}" } }],
              usage: { total_tokens: 1 },
            };
          }),
        },
      },
    };
  });
  return {
    default: OpenAIMock,
  };
});

vi.mock("openai/helpers/zod", () => ({
  zodResponseFormat: (schema: unknown, name: string) => ({
    __zodResponseFormat: true,
    schema,
    name,
    // Mimic the wire shape OpenAI expects, so JSON-stringify round-trips.
    type: "json_schema",
    json_schema: { name, schema },
  }),
}));

function makeConfig(outputSchema: "structured" | "json" | "plain") {
  return {
    apiKey: "test-key",
    baseURL: undefined,
    proxyUrl: undefined,
    timeoutSec: undefined,
    serviceTier: undefined,
    textModel: "test-model",
    imageModel: "test-image-model",
    contextLength: 2048,
    maxOutputTokens: 1024,
    useMaxCompletionTokens: false,
    reasoningEffort: undefined,
    outputSchema,
  };
}

describe("OpenAIInferenceClient.response_format selection", () => {
  beforeEach(() => {
    captured.length = 0;
  });

  function makeCall(
    outputSchema: "structured" | "json" | "plain",
    schema: z.ZodSchema | null,
  ) {
    const client = new OpenAIInferenceClient(makeConfig(outputSchema));
    return client.inferFromText("hello", { schema });
  }

  it("uses json_object when global=json AND a schema is provided (tagging)", async () => {
    await makeCall("json", tagSchema);
    expect(captured).toHaveLength(1);
    expect(captured[0].body.response_format).toEqual({ type: "json_object" });
  });

  it("uses zodResponseFormat when global=structured AND a schema is provided (tagging)", async () => {
    await makeCall("structured", tagSchema);
    expect(captured).toHaveLength(1);
    const rf = captured[0].body.response_format as Record<string, unknown>;
    expect(rf).toBeDefined();
    expect(rf).not.toEqual({ type: "json_object" });
    expect((rf as { json_schema?: unknown }).json_schema).toBeDefined();
  });

  it("sends no response_format when global=plain AND a schema is provided", async () => {
    await makeCall("plain", tagSchema);
    expect(captured).toHaveLength(1);
    expect(captured[0].body.response_format).toBeUndefined();
  });

  // THE BUG FIX: these three cases used to send the global mode even when
  // the caller passed schema=null (e.g. summarization). That made
  // summarization fail with "Prompt must contain the word 'json'" on
  // INFERENCE_OUTPUT_SCHEMA=json, and made summarization send
  // json_object when it shouldn't have.
  it("forces plain when global=json AND schema is null (summarization) — bug #2789", async () => {
    await makeCall("json", null);
    expect(captured).toHaveLength(1);
    expect(captured[0].body.response_format).toBeUndefined();
  });

  it("forces plain when global=structured AND schema is null (summarization) — bug #2789", async () => {
    await makeCall("structured", null);
    expect(captured).toHaveLength(1);
    expect(captured[0].body.response_format).toBeUndefined();
  });

  it("forces plain when global=plain AND schema is null (no-op, but consistent) — bug #2789", async () => {
    await makeCall("plain", null);
    expect(captured).toHaveLength(1);
    expect(captured[0].body.response_format).toBeUndefined();
  });

  it("image path mirrors text path: global=json + schema=null → no response_format", async () => {
    const client = new OpenAIInferenceClient(makeConfig("json"));
    await client.inferFromImage("describe", "image/png", "BASE64", {
      schema: null,
    });
    expect(captured).toHaveLength(1);
    expect(captured[0].body.response_format).toBeUndefined();
  });

  it("image path: global=structured + schema provided → zodResponseFormat", async () => {
    const client = new OpenAIInferenceClient(makeConfig("structured"));
    await client.inferFromImage("describe", "image/png", "BASE64", {
      schema: tagSchema,
    });
    expect(captured).toHaveLength(1);
    const rf = captured[0].body.response_format as Record<string, unknown>;
    expect((rf as { json_schema?: unknown }).json_schema).toBeDefined();
  });
});