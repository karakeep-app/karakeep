/**
 * Live test script for inference providers.
 * Run with: pnpm inference:live-test
 *
 * Set env vars before running:
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY
 */

import { z } from "zod";

/**
 * Actual schema used by the app for tagging (from tagging.ts)
 */
const openAIResponseSchema = z.object({
  tags: z.array(z.string()),
});

/**
 * Realistic tagging prompt similar to what the app sends
 */
function buildRealisticTaggingPrompt(content: string): string {
  return `
You are an expert whose responsibility is to help with automatic tagging for a read-it-later/bookmarking app.
Please analyze the TEXT_CONTENT below and suggest relevant tags that describe its key themes, topics, and main ideas. The rules are:
- Aim for a variety of tags, including broad categories, specific keywords, and potential sub-genres.
- The tags must be in english.
- If the tag is not generic enough, don't include it.
- The content can include text for cookie consent and privacy policy, ignore those while tagging.
- Aim for 3-5 tags.
- If there are no good tags, leave the array empty.

<TEXT_CONTENT>
${content}
</TEXT_CONTENT>
You must respond in JSON with the key "tags" and the value is an array of string tags.`;
}

/**
 * Realistic image prompt similar to what the app sends (from prompts.ts)
 */
function buildRealisticImagePrompt(): string {
  return `
You are an expert whose responsibility is to help with automatic text tagging for a read-it-later/bookmarking app.
Please analyze the attached image and suggest relevant tags that describe its key themes, topics, and main ideas. The rules are:
- Aim for a variety of tags, including broad categories, specific keywords, and potential sub-genres.
- The tags must be in english.
- If the tag is not generic enough, don't include it.
- Aim for 10-15 tags.
- If there are no good tags, don't emit any.
You must respond in valid JSON with the key "tags" and the value is list of tags. Don't wrap the response in a markdown code.`;
}

/**
 * A small test image (1x1 red pixel PNG) for image inference testing
 */
const TEST_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

/**
 * Realistic bookmark content for testing
 */
const REALISTIC_BOOKMARK_CONTENT = `
URL: https://example.com/typescript-best-practices
Title: 10 TypeScript Best Practices Every Developer Should Know
Description: Learn essential TypeScript patterns and practices to write cleaner, more maintainable code.
Content: TypeScript has become the go-to language for modern web development. In this article, we'll explore
10 best practices that will help you write better TypeScript code. From strict null checks to proper type
inference, these patterns will make your codebase more robust and easier to maintain. We'll cover topics
like avoiding 'any', using discriminated unions, leveraging utility types, and more.
`;

interface TestResult {
  provider: string;
  test: string;
  status: "pass" | "fail" | "skip";
  duration?: number;
  response?: string;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(
  provider: string,
  testName: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    results.push({
      provider,
      test: testName,
      status: "pass",
      duration,
      response:
        typeof result === "string"
          ? result.slice(0, 100)
          : JSON.stringify(result).slice(0, 100),
    });
    console.log(`✅ ${provider}/${testName} (${duration}ms)`);
  } catch (e) {
    const duration = Date.now() - start;
    const error = e instanceof Error ? e.message : String(e);
    results.push({
      provider,
      test: testName,
      status: "fail",
      duration,
      error,
    });
    console.log(`❌ ${provider}/${testName} (${duration}ms): ${error}`);
  }
}

async function testOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    results.push({ provider: "openai", test: "all", status: "skip" });
    console.log("⏭️  OpenAI: skipped (no API key)");
    return;
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI();

  // Test 1: Basic chat completion (Chat Completions API)
  await runTest("openai", "chat-completion", async () => {
    const response = await client.chat.completions.create({
      model: "gpt-5.2",
      messages: [{ role: "user", content: "Say 'hello' and nothing else." }],
      max_completion_tokens: 10,
    });
    return response.choices[0]?.message?.content;
  });

  // Test 2: Structured output with realistic tagging prompt (Chat Completions API)
  await runTest("openai", "structured-tagging", async () => {
    const { zodResponseFormat } = await import("openai/helpers/zod");
    const prompt = buildRealisticTaggingPrompt(REALISTIC_BOOKMARK_CONTENT);
    const response = await client.chat.completions.create({
      model: "gpt-5.2",
      messages: [{ role: "user", content: prompt }],
      response_format: zodResponseFormat(openAIResponseSchema, "tagging"),
    });
    const result = JSON.parse(response.choices[0]?.message?.content || "{}");

    // Validate response structure matches what app expects
    if (!Array.isArray(result.tags)) {
      throw new Error("Response missing 'tags' array");
    }
    if (result.tags.length === 0) {
      throw new Error("Expected at least one tag");
    }
    return result;
  });

  // Test 3: Embeddings
  await runTest("openai", "embeddings", async () => {
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: ["hello world", "test embedding"],
    });
    return `${response.data.length} embeddings, dim=${response.data[0]?.embedding.length}`;
  });

  // Test 4: Responses API (new API for GPT-5/o-series)
  await runTest("openai", "responses-api", async () => {
    const response = await client.responses.create({
      model: "gpt-5.2", // Works with any model
      input: "Say 'responses api works' and nothing else.",
    });
    // Get text from output
    const textItem = response.output.find((item) => item.type === "message");
    if (textItem?.type === "message") {
      const textContent = textItem.content.find(
        (c) => c.type === "output_text",
      );
      if (textContent?.type === "output_text") {
        return textContent.text;
      }
    }
    return response;
  });

  // Test 5: Verify Responses API model detection patterns exist in code
  await runTest("openai", "responses-model-check", async () => {
    const fs = await import("fs");
    const url = await import("url");
    const path = await import("path");

    // Get the path to the OpenAI inference client
    const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
    const openaiPath = path.join(__dirname, "openai.ts");
    const content = fs.readFileSync(openaiPath, "utf-8");

    // Check that we detect GPT-5, o1, o3, o4 models for Responses API
    const hasGpt5 = content.includes('model.startsWith("gpt-5")');
    const hasO1 = content.includes('model.startsWith("o1")');
    const hasO3 = content.includes('model.startsWith("o3")');
    const hasO4 = content.includes('model.startsWith("o4")');

    if (!hasGpt5 || !hasO1 || !hasO3 || !hasO4) {
      throw new Error(
        `Missing model prefixes: gpt-5=${hasGpt5}, o1=${hasO1}, o3=${hasO3}, o4=${hasO4}`,
      );
    }

    return "Responses API model detection patterns verified";
  });

  // Test 6: Image inference (like image bookmark tagging)
  await runTest("openai", "image-tagging", async () => {
    const { zodResponseFormat } = await import("openai/helpers/zod");
    const response = await client.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${TEST_IMAGE_BASE64}`,
                detail: "low",
              },
            },
            { type: "text", text: buildRealisticImagePrompt() },
          ],
        },
      ],
      response_format: zodResponseFormat(openAIResponseSchema, "tagging"),
    });
    const result = JSON.parse(response.choices[0]?.message?.content || "{}");
    if (!Array.isArray(result.tags)) {
      throw new Error("Response missing 'tags' array");
    }
    return result;
  });
}

async function testAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    results.push({ provider: "anthropic", test: "all", status: "skip" });
    console.log("⏭️  Anthropic: skipped (no API key)");
    return;
  }

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  // Test 1: Basic message with Claude 4.5
  await runTest("anthropic", "message-4.5", async () => {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 50,
      messages: [{ role: "user", content: "Say 'hello' and nothing else." }],
    });
    const block = response.content[0];
    return block?.type === "text" ? block.text : "";
  });

  // Test 2: Structured output with realistic tagging prompt (Claude 4.5 only)
  await runTest("anthropic", "structured-tagging-4.5", async () => {
    const { zodToJsonSchema } = await import("zod-to-json-schema");
    const rawSchema = zodToJsonSchema(openAIResponseSchema, {
      $refStrategy: "none",
    });
    // Remove $schema field - Anthropic doesn't accept it
    const { $schema, ...jsonSchema } = rawSchema as Record<string, unknown>;
    void $schema;

    const prompt = buildRealisticTaggingPrompt(REALISTIC_BOOKMARK_CONTENT);
    const response = await client.beta.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 200,
      betas: ["structured-outputs-2025-11-13"],
      messages: [{ role: "user", content: prompt }],
      output_format: {
        type: "json_schema",
        schema: jsonSchema,
      },
    });
    const block = response.content.find((b) => b.type === "text");
    const result = block?.type === "text" ? JSON.parse(block.text) : {};

    // Validate response structure matches what app expects
    if (!Array.isArray(result.tags)) {
      throw new Error("Response missing 'tags' array");
    }
    if (result.tags.length === 0) {
      throw new Error("Expected at least one tag");
    }
    return result;
  });

  // Test 3: Verify model validation in our client
  await runTest("anthropic", "model-validation", async () => {
    const { supportsStructuredOutputs } = await import("./anthropic.js");

    // Should support 4.5 models
    if (!supportsStructuredOutputs("claude-sonnet-4-5-20250929")) {
      throw new Error("Should support claude-sonnet-4-5-20250929");
    }
    if (!supportsStructuredOutputs("claude-haiku-4-5")) {
      throw new Error("Should support claude-haiku-4-5");
    }
    if (!supportsStructuredOutputs("claude-opus-4-5")) {
      throw new Error("Should support claude-opus-4-5");
    }

    // Should NOT support older models
    if (supportsStructuredOutputs("claude-sonnet-4-20250514")) {
      throw new Error("Should NOT support claude-sonnet-4-20250514");
    }
    if (supportsStructuredOutputs("claude-3-5-sonnet-20241022")) {
      throw new Error("Should NOT support claude-3-5-sonnet-20241022");
    }

    return "Model validation working correctly";
  });

  // Test 4: Using model alias (claude-sonnet-4-5 instead of dated version)
  await runTest("anthropic", "model-alias", async () => {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5", // alias
      max_tokens: 30,
      messages: [{ role: "user", content: "Reply with just 'ok'" }],
    });
    const block = response.content[0];
    return block?.type === "text" ? block.text : "";
  });

  // Test 5: Haiku 4.5 for faster/cheaper option
  await runTest("anthropic", "haiku-4.5", async () => {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 30,
      messages: [{ role: "user", content: "Reply with just 'fast'" }],
    });
    const block = response.content[0];
    return block?.type === "text" ? block.text : "";
  });

  // Test 6: Image inference (like image bookmark tagging)
  await runTest("anthropic", "image-tagging-4.5", async () => {
    const { zodToJsonSchema } = await import("zod-to-json-schema");
    const rawSchema = zodToJsonSchema(openAIResponseSchema, {
      $refStrategy: "none",
    });
    const { $schema, ...jsonSchema } = rawSchema as Record<string, unknown>;
    void $schema;

    const response = await client.beta.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 200,
      betas: ["structured-outputs-2025-11-13"],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: TEST_IMAGE_BASE64,
              },
            },
            { type: "text", text: buildRealisticImagePrompt() },
          ],
        },
      ],
      output_format: {
        type: "json_schema",
        schema: jsonSchema,
      },
    });
    const block = response.content.find((b) => b.type === "text");
    const result = block?.type === "text" ? JSON.parse(block.text) : {};
    if (!Array.isArray(result.tags)) {
      throw new Error("Response missing 'tags' array");
    }
    return result;
  });
}

async function testGoogle() {
  if (!process.env.GEMINI_API_KEY) {
    results.push({ provider: "google", test: "all", status: "skip" });
    console.log("⏭️  Google: skipped (no API key)");
    return;
  }

  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Test 1: Basic generation
  await runTest("google", "generate", async () => {
    const response = await client.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Say 'hello' and nothing else.",
    });
    return response.text;
  });

  // Test 2: Structured output with realistic tagging prompt
  await runTest("google", "structured-tagging", async () => {
    const { zodToJsonSchema } = await import("zod-to-json-schema");
    const prompt = buildRealisticTaggingPrompt(REALISTIC_BOOKMARK_CONTENT);
    const response = await client.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(openAIResponseSchema, {
          $refStrategy: "none",
        }),
      },
    });
    const result = JSON.parse(response.text ?? "{}");

    // Validate response structure matches what app expects
    if (!Array.isArray(result.tags)) {
      throw new Error("Response missing 'tags' array");
    }
    if (result.tags.length === 0) {
      throw new Error("Expected at least one tag");
    }
    return result;
  });

  // Test 3: Embeddings
  await runTest("google", "embeddings", async () => {
    const response = await client.models.embedContent({
      model: "gemini-embedding-001",
      contents: ["hello world", "test embedding"],
    });
    return `${response.embeddings?.length} embeddings, dim=${response.embeddings?.[0]?.values?.length}`;
  });

  // Test 4: Image inference (like image bookmark tagging)
  await runTest("google", "image-tagging", async () => {
    const { zodToJsonSchema } = await import("zod-to-json-schema");
    const response = await client.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          inlineData: {
            mimeType: "image/png",
            data: TEST_IMAGE_BASE64,
          },
        },
        buildRealisticImagePrompt(),
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(openAIResponseSchema, {
          $refStrategy: "none",
        }),
      },
    });
    const result = JSON.parse(response.text ?? "{}");
    if (!Array.isArray(result.tags)) {
      throw new Error("Response missing 'tags' array");
    }
    return result;
  });
}

/**
 * Test our ACTUAL InferenceClient implementations - the same code path the app uses.
 * This is the real integration test that verifies the factory and client classes work.
 */
async function testInferenceClientImplementations() {
  // Import serverConfig and factory
  const { default: serverConfig } = await import("../config.js");
  const { InferenceClientFactory } = await import("./index.js");

  const provider = serverConfig.inference.provider;
  const textModel = serverConfig.inference.textModel;

  if (!provider) {
    console.log("⏭️  No INFERENCE_PROVIDER configured, skipping client tests");
    return;
  }

  console.log(`   Provider: ${provider}, Model: ${textModel}`);

  // Build the client via factory (exactly like the app does)
  const client = InferenceClientFactory.build();

  if (!client) {
    console.log(`⏭️  Factory returned null for provider: ${provider}`);
    return;
  }

  // Test 1: Basic inferFromText (no schema - like summarization)
  await runTest(`factory-${provider}`, "inferFromText-plain", async () => {
    const result = await client.inferFromText(
      "Summarize in one sentence: TypeScript is a typed superset of JavaScript.",
      { schema: undefined },
    );

    if (!result.response || result.response.length < 10) {
      throw new Error(`Response too short: ${result.response}`);
    }

    return {
      response: result.response.slice(0, 100),
      tokens: result.totalTokens,
    };
  });

  // Test 2: inferFromText with schema (like tagging)
  await runTest(`factory-${provider}`, "inferFromText-tagging", async () => {
    const prompt = buildRealisticTaggingPrompt(REALISTIC_BOOKMARK_CONTENT);

    const result = await client.inferFromText(prompt, {
      schema: openAIResponseSchema,
    });

    // Parse exactly like the app does in tagging.ts
    const parsed = openAIResponseSchema.parse(JSON.parse(result.response));

    if (parsed.tags.length === 0) {
      throw new Error("Expected at least one tag");
    }

    return {
      tags: parsed.tags,
      tokens: result.totalTokens,
    };
  });

  // Test 3: inferFromImage with schema (like image bookmark tagging)
  await runTest(`factory-${provider}`, "inferFromImage-tagging", async () => {
    const result = await client.inferFromImage(
      buildRealisticImagePrompt(),
      "image/png",
      TEST_IMAGE_BASE64,
      { schema: openAIResponseSchema },
    );

    // Parse exactly like the app does in tagging.ts
    const parsed = openAIResponseSchema.parse(JSON.parse(result.response));

    return {
      tags: parsed.tags,
      tokens: result.totalTokens,
    };
  });
}

async function main() {
  console.log("🧪 Live Inference Provider Tests\n");
  console.log("================================\n");

  console.log("--- Direct SDK Tests ---\n");

  await testOpenAI();
  await testAnthropic();
  await testGoogle();

  // Test our InferenceClient implementations with realistic tagging
  console.log("\n--- InferenceClient Implementation Tests ---\n");
  await testInferenceClientImplementations();

  console.log("\n================================");
  console.log("\n📊 Summary:\n");

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;

  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);

  if (failed > 0) {
    console.log("\n❌ Failed tests:");
    results
      .filter((r) => r.status === "fail")
      .forEach((r) => {
        console.log(`  - ${r.provider}/${r.test}: ${r.error}`);
      });
    process.exit(1);
  }

  console.log("\n✅ All tests passed!");
}

main().catch(console.error);
