import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";

import type {
  InferenceClient,
  InferenceOptions,
  InferenceResponse,
} from "./types";
import serverConfig from "../config";
import { defaultInferenceOptions } from "./types";

/**
 * Convert a Zod schema to Anthropic's output_format structure.
 * Uses zod-to-json-schema since betaZodOutputFormat requires Zod 4.
 */
function zodToAnthropicFormat(schema: InferenceOptions["schema"]) {
  if (!schema) return undefined;

  const rawSchema = zodToJsonSchema(schema, { $refStrategy: "none" });
  // Remove $schema field - Anthropic doesn't accept it
  const { $schema, ...jsonSchema } = rawSchema as Record<string, unknown>;
  void $schema;

  return {
    type: "json_schema" as const,
    schema: jsonSchema,
  };
}

/**
 * Claude models that support structured outputs (beta).
 * Per official docs, structured outputs work with Claude Sonnet 4.5 and Opus 4.1.
 * Haiku 4.5 and Opus 4.5 are included as they likely support it too (same generation).
 * @see https://platform.claude.com/docs/en/build-with-claude/structured-outputs
 */
const STRUCTURED_OUTPUT_MODELS = [
  // Officially documented as supported:
  // Claude Sonnet 4.5
  "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-5",
  // Claude Opus 4.1
  "claude-opus-4-1-20250415",
  "claude-opus-4-1",
  // Likely supported (same generation, not explicitly documented):
  // Claude Haiku 4.5
  "claude-haiku-4-5-20251001",
  "claude-haiku-4-5",
  // Claude Opus 4.5
  "claude-opus-4-5-20251101",
  "claude-opus-4-5",
];

/**
 * Check if a Claude model supports structured outputs.
 * Exported for testing.
 */
export function supportsStructuredOutputs(model: string): boolean {
  return STRUCTURED_OUTPUT_MODELS.some(
    (m) => model === m || model.startsWith(m),
  );
}

/**
 * Validate that the model supports required features.
 * Throws if the model doesn't support structured outputs when needed.
 */
function validateModel(model: string, needsStructuredOutput: boolean): void {
  if (needsStructuredOutput && !supportsStructuredOutputs(model)) {
    throw new Error(
      `Model "${model}" does not support structured outputs. ` +
        `Use a Claude 4.5 model (e.g., claude-sonnet-4-5, claude-opus-4-5, claude-haiku-4-5) ` +
        `or set INFERENCE_OUTPUT_SCHEMA=plain to disable structured outputs.`,
    );
  }
}

/**
 * Supported image media types for Anthropic's API.
 */
const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
type AnthropicMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

/**
 * Validate and convert a content type to Anthropic's expected media type.
 * Throws if the content type is not supported.
 */
function toAnthropicMediaType(contentType: string): AnthropicMediaType {
  if (!SUPPORTED_MEDIA_TYPES.includes(contentType as AnthropicMediaType)) {
    throw new Error(
      `Unsupported image type: "${contentType}". Anthropic supports: ${SUPPORTED_MEDIA_TYPES.join(", ")}`,
    );
  }
  return contentType as AnthropicMediaType;
}

/**
 * Anthropic Inference Client
 *
 * Uses Claude's Messages API for text and vision inference.
 * Supports structured outputs via output_format (beta feature).
 * Only Claude 4.5+ models support structured outputs.
 * Note: Anthropic does not provide an embeddings API.
 */
export class AnthropicInferenceClient implements InferenceClient {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: serverConfig.inference.anthropicApiKey,
      ...(serverConfig.inference.anthropicBaseUrl && {
        baseURL: serverConfig.inference.anthropicBaseUrl,
      }),
    });
  }

  async inferFromText(
    prompt: string,
    _opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse> {
    const optsWithDefaults: InferenceOptions = {
      ...defaultInferenceOptions,
      ..._opts,
    };

    const model = serverConfig.inference.textModel;
    const useStructuredOutput =
      !!optsWithDefaults.schema &&
      serverConfig.inference.outputSchema !== "plain";

    // Validate model supports structured outputs if needed
    validateModel(model, useStructuredOutput);

    // Build base request options
    const baseOptions: MessageCreateParamsNonStreaming = {
      model,
      max_tokens: serverConfig.inference.maxOutputTokens,
      messages: [{ role: "user", content: prompt }],
    };

    // Only add beta header and output_format when using structured outputs
    if (useStructuredOutput) {
      baseOptions.betas = ["structured-outputs-2025-11-13"];
      baseOptions.output_format = zodToAnthropicFormat(
        optsWithDefaults.schema!,
      );
    }

    const message = await this.anthropic.beta.messages.create(baseOptions, {
      signal: optsWithDefaults.abortSignal ?? undefined,
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Got no text content from Anthropic");
    }

    const totalTokens =
      (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0);

    return { response: textBlock.text, totalTokens };
  }

  async inferFromImage(
    prompt: string,
    contentType: string,
    image: string,
    _opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse> {
    const optsWithDefaults: InferenceOptions = {
      ...defaultInferenceOptions,
      ..._opts,
    };

    const model = serverConfig.inference.imageModel;
    const useStructuredOutput =
      !!optsWithDefaults.schema &&
      serverConfig.inference.outputSchema !== "plain";

    // Validate model supports structured outputs if needed
    validateModel(model, useStructuredOutput);

    // Validate and convert content type to Anthropic's expected media type
    const mediaType = toAnthropicMediaType(contentType);

    // Build base request options
    const baseOptions: MessageCreateParamsNonStreaming = {
      model,
      max_tokens: serverConfig.inference.maxOutputTokens,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: image,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    };

    // Only add beta header and output_format when using structured outputs
    if (useStructuredOutput) {
      baseOptions.betas = ["structured-outputs-2025-11-13"];
      baseOptions.output_format = zodToAnthropicFormat(
        optsWithDefaults.schema!,
      );
    }

    const message = await this.anthropic.beta.messages.create(baseOptions, {
      signal: optsWithDefaults.abortSignal ?? undefined,
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Got no text content from Anthropic");
    }

    const totalTokens =
      (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0);

    return { response: textBlock.text, totalTokens };
  }
}
