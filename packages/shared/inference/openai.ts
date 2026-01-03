import type { Response as OpenAIResponse } from "openai/resources/responses/responses";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import * as undici from "undici";
import { zodToJsonSchema } from "zod-to-json-schema";

import type {
  EmbeddingClient,
  EmbeddingResponse,
  InferenceClient,
  InferenceOptions,
  InferenceResponse,
} from "./types";
import serverConfig from "../config";
import { defaultInferenceOptions } from "./types";

/**
 * Check if model requires max_completion_tokens instead of max_tokens.
 * GPT-5 and o-series models require this parameter.
 */
function requiresMaxCompletionTokens(model: string): boolean {
  return (
    model.startsWith("gpt-5") ||
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4")
  );
}

/**
 * Get the appropriate token limit parameter for the model.
 * GPT-5 and o-series require max_completion_tokens; others use max_tokens.
 * Note: max_tokens is deprecated in OpenAI API, but kept for older models.
 */
function getTokenLimitParam(model: string): Record<string, number> {
  const tokens = serverConfig.inference.maxOutputTokens;
  if (requiresMaxCompletionTokens(model)) {
    return { max_completion_tokens: tokens };
  }
  return { max_tokens: tokens };
}

/**
 * Determines which OpenAI API to use based on model name.
 * GPT-5+ models can use the Responses API for advanced features.
 * GPT-4 and earlier use Chat Completions API.
 * Exported for testing.
 */
export function shouldUseResponsesApi(model: string): boolean {
  // Use Responses API for GPT-5+ models when explicitly enabled
  if (!serverConfig.inference.openaiUseResponsesApi) {
    return false;
  }
  return requiresMaxCompletionTokens(model);
}

/**
 * OpenAI Inference Client
 *
 * Supports both Chat Completions API (legacy, broad compatibility) and
 * Responses API (newer, GPT-5+ features like reasoning effort).
 */
export class OpenAIInferenceClient implements InferenceClient {
  openAI: OpenAI;

  constructor() {
    const fetchOptions = serverConfig.inference.openAIProxyUrl
      ? {
          dispatcher: new undici.ProxyAgent(
            serverConfig.inference.openAIProxyUrl,
          ),
        }
      : undefined;

    this.openAI = new OpenAI({
      apiKey: serverConfig.inference.openAIApiKey,
      baseURL: serverConfig.inference.openAIBaseUrl,
      ...(fetchOptions ? { fetchOptions } : {}),
      defaultHeaders: {
        "X-Title": "Karakeep",
        "HTTP-Referer": "https://karakeep.app",
      },
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

    if (shouldUseResponsesApi(model)) {
      return this.inferFromTextResponses(prompt, model, optsWithDefaults);
    }
    return this.inferFromTextChatCompletions(prompt, model, optsWithDefaults);
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

    if (shouldUseResponsesApi(model)) {
      return this.inferFromImageResponses(
        prompt,
        contentType,
        image,
        model,
        optsWithDefaults,
      );
    }
    return this.inferFromImageChatCompletions(
      prompt,
      contentType,
      image,
      model,
      optsWithDefaults,
    );
  }

  // ===========================================================================
  // Chat Completions API (Legacy - works with all models)
  // ===========================================================================

  private async inferFromTextChatCompletions(
    prompt: string,
    model: string,
    opts: InferenceOptions,
  ): Promise<InferenceResponse> {
    const chatCompletion = await this.openAI.chat.completions.create(
      {
        messages: [{ role: "user", content: prompt }],
        model,
        ...getTokenLimitParam(model),
        response_format: this.getChatCompletionsResponseFormat(opts),
      },
      {
        signal: opts.abortSignal,
      },
    );

    const response = chatCompletion.choices[0].message.content;
    if (!response) {
      throw new Error("Got no message content from OpenAI Chat Completions");
    }
    return { response, totalTokens: chatCompletion.usage?.total_tokens };
  }

  private async inferFromImageChatCompletions(
    prompt: string,
    contentType: string,
    image: string,
    model: string,
    opts: InferenceOptions,
  ): Promise<InferenceResponse> {
    const chatCompletion = await this.openAI.chat.completions.create(
      {
        model,
        ...getTokenLimitParam(model),
        response_format: this.getChatCompletionsResponseFormat(opts),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${contentType};base64,${image}`,
                  detail: "low",
                },
              },
            ],
          },
        ],
      },
      {
        signal: opts.abortSignal,
      },
    );

    const response = chatCompletion.choices[0].message.content;
    if (!response) {
      throw new Error("Got no message content from OpenAI Chat Completions");
    }
    return { response, totalTokens: chatCompletion.usage?.total_tokens };
  }

  private getChatCompletionsResponseFormat(opts: InferenceOptions) {
    const outputSchema = serverConfig.inference.outputSchema;

    if (outputSchema === "structured" && opts.schema) {
      return zodResponseFormat(opts.schema, "schema");
    } else if (outputSchema === "json") {
      return { type: "json_object" as const };
    }
    return undefined;
  }

  // ===========================================================================
  // Responses API (GPT-5+ features: reasoning, verbosity, conversation)
  // ===========================================================================

  private async inferFromTextResponses(
    prompt: string,
    model: string,
    opts: InferenceOptions,
  ): Promise<InferenceResponse> {
    const requestObj = this.buildResponsesRequest(model, prompt, opts);

    const response = await this.openAI.responses.create(requestObj, {
      signal: opts.abortSignal,
    });

    return this.extractResponsesApiResult(response, opts);
  }

  private async inferFromImageResponses(
    prompt: string,
    contentType: string,
    image: string,
    model: string,
    opts: InferenceOptions,
  ): Promise<InferenceResponse> {
    // Responses API handles images as structured input
    const input = [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          {
            type: "input_image",
            image_url: `data:${contentType};base64,${image}`,
          },
        ],
      },
    ];

    const requestObj = this.buildResponsesRequest(model, input, opts);

    const response = await this.openAI.responses.create(requestObj, {
      signal: opts.abortSignal,
    });

    return this.extractResponsesApiResult(response, opts);
  }

  private buildResponsesRequest(
    model: string,
    input: string | unknown[],
    opts: InferenceOptions,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestObj: any = {
      model,
      input,
      text: this.getResponsesTextFormat(opts),
      store: opts.store ?? false,
      temperature: 1,
      top_p: 1,
    };

    // GPT-5 and o-series models support reasoning effort
    // Note: o-series models default to "medium" and don't support "none"
    if (
      model.startsWith("gpt-5") ||
      model.startsWith("o1") ||
      model.startsWith("o3") ||
      model.startsWith("o4")
    ) {
      requestObj.reasoning = {
        effort:
          opts.reasoningEffort ||
          serverConfig.inference.openaiReasoningEffort ||
          "low",
      };
    }

    // o-series models (o1, o3, o4) need max_output_tokens to control output length
    if (
      model.startsWith("o1") ||
      model.startsWith("o3") ||
      model.startsWith("o4")
    ) {
      requestObj.max_output_tokens = serverConfig.inference.maxOutputTokens;
    }

    if (opts.previousResponseId) {
      requestObj.previous_response_id = opts.previousResponseId;
    }

    return requestObj;
  }

  private getResponsesTextFormat(opts: InferenceOptions) {
    if (opts.schema) {
      return {
        format: {
          type: "json_schema",
          name: "response",
          strict: true,
          schema: zodToJsonSchema(opts.schema),
        },
      };
    } else if (serverConfig.inference.outputSchema === "json") {
      return { format: { type: "json" } };
    }
    return { format: { type: "text" } };
  }

  private extractResponsesApiResult(
    response: OpenAIResponse,
    opts: InferenceOptions,
  ): InferenceResponse {
    // Use SDK's output_text convenience property (aggregates all text output)
    const outputText = response.output_text;

    if (!outputText) {
      throw new Error("Got no output text from OpenAI Responses API");
    }

    // Parse JSON if expecting structured output
    let finalResponse = outputText;
    if (opts.schema || serverConfig.inference.outputSchema === "json") {
      try {
        finalResponse = JSON.stringify(JSON.parse(outputText));
      } catch {
        // If parsing fails, return as-is
        finalResponse = outputText;
      }
    }

    return {
      response: finalResponse,
      totalTokens: response.usage?.total_tokens,
    };
  }
}

/**
 * OpenAI Embedding Client
 *
 * Uses the /v1/embeddings endpoint for text embeddings.
 */
export class OpenAIEmbeddingClient implements EmbeddingClient {
  openAI: OpenAI;

  constructor() {
    const fetchOptions = serverConfig.inference.openAIProxyUrl
      ? {
          dispatcher: new undici.ProxyAgent(
            serverConfig.inference.openAIProxyUrl,
          ),
        }
      : undefined;

    this.openAI = new OpenAI({
      apiKey: serverConfig.inference.openAIApiKey,
      baseURL: serverConfig.inference.openAIBaseUrl,
      ...(fetchOptions ? { fetchOptions } : {}),
      defaultHeaders: {
        "X-Title": "Karakeep",
        "HTTP-Referer": "https://karakeep.app",
      },
    });
  }

  async generateEmbeddingFromText(
    inputs: string[],
  ): Promise<EmbeddingResponse> {
    const model = serverConfig.embedding.textModel;
    const embedResponse = await this.openAI.embeddings.create({
      model,
      input: inputs,
    });
    const embedding2D: number[][] = embedResponse.data.map(
      (embedding: OpenAI.Embedding) => embedding.embedding,
    );
    return { embeddings: embedding2D };
  }
}
