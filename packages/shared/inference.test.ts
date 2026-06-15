import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Mock the Anthropic SDK: default export is a class exposing messages.create.
const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMock };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(public opts: any) {}
  },
}));

import { AnthropicInferenceClient } from "./inference";

function makeClient(overrides = {}) {
  return new AnthropicInferenceClient({
    apiKey: "test-key",
    textModel: "gpt-4.1-mini",
    imageModel: "gpt-4o-mini",
    maxOutputTokens: 100,
    outputSchema: "structured",
    ...overrides,
  });
}

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({
    content: [{ type: "text", text: '{"tags":["a"]}' }],
    usage: { input_tokens: 10, output_tokens: 5 },
  });
});

describe("AnthropicInferenceClient text inference", () => {
  it("substitutes the Claude default when the model is the OpenAI default", async () => {
    const client = makeClient();
    await client.inferFromText("hi", { schema: null });
    expect(createMock.mock.calls[0][0].model).toBe("claude-haiku-4-5");
  });

  it("preserves an explicitly configured Claude model", async () => {
    const client = makeClient({ textModel: "claude-sonnet-4-6" });
    await client.inferFromText("hi", { schema: null });
    expect(createMock.mock.calls[0][0].model).toBe("claude-sonnet-4-6");
  });

  it("sends max_tokens and the user message, and returns text + summed tokens", async () => {
    const client = makeClient();
    const res = await client.inferFromText("hello", { schema: null });
    const body = createMock.mock.calls[0][0];
    expect(body.max_tokens).toBe(100);
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(res.response).toBe('{"tags":["a"]}');
    expect(res.totalTokens).toBe(15);
  });

  it("attaches output_config json_schema in structured mode when a schema is given", async () => {
    const client = makeClient();
    await client.inferFromText("hi", {
      schema: z.object({ tags: z.array(z.string()) }),
    });
    const body = createMock.mock.calls[0][0];
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.output_config.format.schema).toBeTypeOf("object");
  });

  it("omits output_config in plain mode", async () => {
    const client = makeClient({ outputSchema: "plain" });
    await client.inferFromText("hi", {
      schema: z.object({ tags: z.array(z.string()) }),
    });
    expect(createMock.mock.calls[0][0].output_config).toBeUndefined();
  });

  it("omits output_config when structured mode has no schema (e.g. summarization)", async () => {
    const client = makeClient();
    await client.inferFromText("summarize", { schema: null });
    expect(createMock.mock.calls[0][0].output_config).toBeUndefined();
  });
});
