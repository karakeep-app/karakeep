import { Ollama } from "ollama";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import * as undici from "undici";
import { z } from "zod";

import serverConfig from "./config";
import { customFetch } from "./customFetch";
import logger from "./logger";

export interface InferenceResponse {
  response: string;
  totalTokens: number | undefined;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  totalTokens: number | undefined;
  promptTokens: number | undefined;
}

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "number")
  );
}

function isNumberArray2D(value: unknown): value is number[][] {
  return Array.isArray(value) && value.every(isNumberArray);
}

function parseEmbeddingResponse(response: unknown): number[][] {
  if (!response || typeof response !== "object") {
    throw new Error(`Got invalid embedding response from inference provider`);
  }

  if ("data" in response && Array.isArray(response.data)) {
    const embeddings = response.data.map((item) => {
      if (
        item &&
        typeof item === "object" &&
        "embedding" in item &&
        isNumberArray(item.embedding)
      ) {
        return item.embedding;
      }
      throw new Error(
        `Got embedding response item without a numeric embedding array`,
      );
    });
    return embeddings;
  }

  if ("embeddings" in response && isNumberArray2D(response.embeddings)) {
    return response.embeddings;
  }

  if ("embedding" in response && isNumberArray(response.embedding)) {
    return [response.embedding];
  }

  const keys = Object.keys(response).join(", ");
  throw new Error(
    `Got embedding response with unsupported shape from inference provider. Keys: ${keys}`,
  );
}

function getNumericField(
  value: Record<string, unknown>,
  field: string,
): number | undefined {
  const raw = value[field];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function parseEmbeddingUsage(response: unknown): {
  promptTokens: number | undefined;
  totalTokens: number | undefined;
} {
  if (!response || typeof response !== "object") {
    return { promptTokens: undefined, totalTokens: undefined };
  }

  const responseObj = response as Record<string, unknown>;
  const usage = responseObj.usage;
  if (usage && typeof usage === "object") {
    const usageObj = usage as Record<string, unknown>;
    return {
      promptTokens: getNumericField(usageObj, "prompt_tokens"),
      totalTokens: getNumericField(usageObj, "total_tokens"),
    };
  }

  const promptTokens =
    getNumericField(responseObj, "prompt_eval_count") ??
    getNumericField(responseObj, "prompt_tokens");
  const totalTokens =
    getNumericField(responseObj, "total_tokens") ??
    getNumericField(responseObj, "eval_count") ??
    promptTokens;

  return { promptTokens, totalTokens };
}

export interface InferenceOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodSchema<any> | null;
  abortSignal?: AbortSignal;
}

const defaultInferenceOptions: InferenceOptions = {
  schema: null,
};

export interface InferenceClient {
  inferFromText(
    prompt: string,
    opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse>;
  inferFromImage(
    prompt: string,
    contentType: string,
    image: string,
    opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse>;
  generateEmbeddingFromText(inputs: string[]): Promise<EmbeddingResponse>;
}

/**
 * Resolve the effective output schema for an inference call.
 *
 * `serverConfig.inference.outputSchema` is a global setting, but individual
 * callers have different needs: tagging passes a Zod schema and needs a
 * structured response, while summarization passes `schema: null` and needs
 * free-form text. Forcing one global schema across both makes at least one of
 * them fail (e.g. `json` on a summary prompt without the word "json" → 400;
 * `structured` on a model that doesn't support zodResponseFormat → 400).
 *
 * Rule: if the caller provided a schema, honour the global mode (structured
 * uses zodResponseFormat, json uses json_object, plain uses nothing). If the
 * caller did NOT provide a schema, force plain so we never send a
 * `response_format` that the prompt can't satisfy.
 */
function resolveOutputSchema(
  globalMode: typeof serverConfig.inference.outputSchema,
  callSchema: z.ZodSchema<unknown> | null,
): "structured" | "json" | "plain" {
  if (callSchema === null) {
    return "plain";
  }
  return globalMode;
}

interface ResponseFormatJSONObject {
  type: "json_object";
}
type ResponseFormatOption =
  | ReturnType<typeof zodResponseFormat>
  | ResponseFormatJSONObject
  | undefined;

const responseFormatByMode: Record<
  "structured" | "json" | "plain",
  ResponseFormatOption
> = {
  structured: undefined, // filled in per-call (depends on schema)
  json: { type: "json_object" },
  plain: undefined,
};

export interface OpenAIInferenceConfig {
  apiKey: string;
  baseURL?: string;
  proxyUrl?: string;
  timeoutSec?: number;
  serviceTier?: typeof serverConfig.inference.openAIServiceTier;
  textModel: string;
  imageModel: string;
  contextLength: number;
  maxOutputTokens: number;
  useMaxCompletionTokens: boolean;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  outputSchema: "structured" | "json" | "plain";
}

export class InferenceClientFactory {
  static build(): InferenceClient | null {
    if (serverConfig.inference.openAIApiKey) {
      return OpenAIInferenceClient.fromConfig();
    }

    if (serverConfig.inference.ollamaBaseUrl) {
      return OllamaInferenceClient.fromConfig();
    }
    return null;
  }
}

export class OpenAIInferenceClient implements InferenceClient {
  openAI: OpenAI;
  private config: OpenAIInferenceConfig;

  constructor(config: OpenAIInferenceConfig) {
    this.config = config;

    this.openAI = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout:
        config.timeoutSec !== undefined ? config.timeoutSec * 1000 : undefined,
      defaultHeaders: {
        "X-Title": "Karakeep",
        "HTTP-Referer": "https://karakeep.app",
      },
      fetchOptions: config.proxyUrl
        ? { dispatcher: new undici.ProxyAgent(config.proxyUrl) }
        : undefined,
    });
  }

  static fromConfig(): OpenAIInferenceClient {
    return new OpenAIInferenceClient({
      apiKey: serverConfig.inference.openAIApiKey!,
      baseURL: serverConfig.inference.openAIBaseUrl,
      proxyUrl: serverConfig.inference.openAIProxyUrl,
      timeoutSec: serverConfig.inference.openAITimeoutSec,
      serviceTier: serverConfig.inference.openAIServiceTier,
      textModel: serverConfig.inference.textModel,
      imageModel: serverConfig.inference.imageModel,
      contextLength: serverConfig.inference.contextLength,
      maxOutputTokens: serverConfig.inference.maxOutputTokens,
      useMaxCompletionTokens: serverConfig.inference.useMaxCompletionTokens,
      outputSchema: serverConfig.inference.outputSchema,
      reasoningEffort: serverConfig.inference.openAIReasoningEffort,
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
    const effectiveSchema = resolveOutputSchema(
      this.config.outputSchema,
      optsWithDefaults.schema,
    );
    const chatCompletion = await this.openAI.chat.completions.create(
      {
        messages: [{ role: "user", content: prompt }],
        model: this.config.textModel,
        ...(this.config.serviceTier
          ? { service_tier: this.config.serviceTier }
          : {}),
        ...(this.config.useMaxCompletionTokens
          ? { max_completion_tokens: this.config.maxOutputTokens }
          : { max_tokens: this.config.maxOutputTokens }),
        response_format:
          effectiveSchema === "structured" && optsWithDefaults.schema
            ? zodResponseFormat(optsWithDefaults.schema, "schema")
            : responseFormatByMode[effectiveSchema],
        reasoning_effort: this.config.reasoningEffort,
      },
      {
        signal: optsWithDefaults.abortSignal,
      },
    );

    const response = chatCompletion.choices[0].message.content;
    if (!response) {
      throw new Error(`Got no message content from OpenAI`);
    }
    return { response, totalTokens: chatCompletion.usage?.total_tokens };
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
    const effectiveSchema = resolveOutputSchema(
      this.config.outputSchema,
      optsWithDefaults.schema,
    );
    const chatCompletion = await this.openAI.chat.completions.create(
      {
        model: this.config.imageModel,
        ...(this.config.serviceTier
          ? { service_tier: this.config.serviceTier }
          : {}),
        ...(this.config.useMaxCompletionTokens
          ? { max_completion_tokens: this.config.maxOutputTokens }
          : { max_tokens: this.config.maxOutputTokens }),
        response_format:
          effectiveSchema === "structured" && optsWithDefaults.schema
            ? zodResponseFormat(optsWithDefaults.schema, "schema")
            : responseFormatByMode[effectiveSchema],
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
        signal: optsWithDefaults.abortSignal,
      },
    );

    const response = chatCompletion.choices[0].message.content;
    if (!response) {
      throw new Error(`Got no message content from OpenAI`);
    }
    return { response, totalTokens: chatCompletion.usage?.total_tokens };
  }

  async generateEmbeddingFromText(
    inputs: string[],
  ): Promise<EmbeddingResponse> {
    const model = serverConfig.embedding.textModel;
    const embedResponse = await this.openAI.embeddings.create({
      model: model,
      input: inputs,
    });
    const embedding2D = parseEmbeddingResponse(embedResponse);
    const usage = parseEmbeddingUsage(embedResponse);
    return { embeddings: embedding2D, ...usage };
  }
}

export interface OllamaInferenceConfig {
  baseUrl: string;
  textModel: string;
  imageModel: string;
  contextLength: number;
  maxOutputTokens: number;
  keepAlive?: string;
  outputSchema: "structured" | "json" | "plain";
}

class OllamaInferenceClient implements InferenceClient {
  ollama: Ollama;
  private config: OllamaInferenceConfig;

  constructor(config: OllamaInferenceConfig) {
    this.config = config;
    this.ollama = new Ollama({
      host: config.baseUrl,
      fetch: customFetch, // Use the custom fetch with configurable timeout
    });
  }

  static fromConfig(): OllamaInferenceClient {
    return new OllamaInferenceClient({
      baseUrl: serverConfig.inference.ollamaBaseUrl!,
      textModel: serverConfig.inference.textModel,
      imageModel: serverConfig.inference.imageModel,
      contextLength: serverConfig.inference.contextLength,
      maxOutputTokens: serverConfig.inference.maxOutputTokens,
      keepAlive: serverConfig.inference.ollamaKeepAlive,
      outputSchema: serverConfig.inference.outputSchema,
    });
  }

  async runModel(
    model: string,
    prompt: string,
    _opts: InferenceOptions,
    image?: string,
  ) {
    const optsWithDefaults: InferenceOptions = {
      ...defaultInferenceOptions,
      ..._opts,
    };

    let newAbortSignal = undefined;
    if (optsWithDefaults.abortSignal) {
      newAbortSignal = AbortSignal.any([optsWithDefaults.abortSignal]);
      newAbortSignal.onabort = () => {
        this.ollama.abort();
      };
    }
    const effectiveSchema = resolveOutputSchema(
      this.config.outputSchema,
      optsWithDefaults.schema,
    );
    const chatCompletion = await this.ollama.generate({
      model: model,
      format:
        effectiveSchema === "structured" && optsWithDefaults.schema
          ? // Use Zod 4's native JSON Schema emitter for Ollama structured output.
            z.toJSONSchema(optsWithDefaults.schema)
          : effectiveSchema === "json"
            ? "json"
            : undefined,
      stream: true,
      keep_alive: this.config.keepAlive,
      options: {
        num_ctx: this.config.contextLength,
        num_predict: this.config.maxOutputTokens,
      },
      prompt: prompt,
      images: image ? [image] : undefined,
    });

    let totalTokens = 0;
    let response = "";
    try {
      for await (const part of chatCompletion) {
        response += part.response;
        if (!isNaN(part.eval_count)) {
          totalTokens += part.eval_count;
        }
        if (!isNaN(part.prompt_eval_count)) {
          totalTokens += part.prompt_eval_count;
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw e;
      }
      // There seem to be some bug in ollama where you can get some successful response, but still throw an error.
      // Using stream + accumulating the response so far is a workaround.
      // https://github.com/ollama/ollama-js/issues/72
      totalTokens = NaN;
      logger.warn(
        `Got an exception from ollama, will still attempt to deserialize the response we got so far: ${e}`,
      );
    } finally {
      if (newAbortSignal) {
        newAbortSignal.onabort = null;
      }
    }

    return { response, totalTokens };
  }

  async inferFromText(
    prompt: string,
    _opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse> {
    const optsWithDefaults: InferenceOptions = {
      ...defaultInferenceOptions,
      ..._opts,
    };
    return await this.runModel(
      this.config.textModel,
      prompt,
      optsWithDefaults,
      undefined,
    );
  }

  async inferFromImage(
    prompt: string,
    _contentType: string,
    image: string,
    _opts: Partial<InferenceOptions>,
  ): Promise<InferenceResponse> {
    const optsWithDefaults: InferenceOptions = {
      ...defaultInferenceOptions,
      ..._opts,
    };
    return await this.runModel(
      this.config.imageModel,
      prompt,
      optsWithDefaults,
      image,
    );
  }

  async generateEmbeddingFromText(
    inputs: string[],
  ): Promise<EmbeddingResponse> {
    const embedding = await this.ollama.embed({
      model: serverConfig.embedding.textModel,
      input: inputs,
      // Truncate the input to fit into the model's max token limit,
      // in the future we want to add a way to split the input into multiple parts.
      truncate: true,
    });
    const usage = parseEmbeddingUsage(embedding);
    return { embeddings: embedding.embeddings, ...usage };
  }
}
