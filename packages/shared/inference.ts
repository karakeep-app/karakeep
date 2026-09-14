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

function validateEmbeddingDimensions(embeddings: number[][]): void {
  const expectedDimensions = serverConfig.embedding.dimensions;
  for (const [index, embedding] of embeddings.entries()) {
    if (embedding.length !== expectedDimensions) {
      throw new Error(
        `Got embedding response item ${index} with ${embedding.length} dimensions from inference provider; expected ${expectedDimensions} configured by EMBEDDING_DIMENSIONS`,
      );
    }
  }
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

export interface EmbeddingClient {
  generateEmbeddingFromText(inputs: string[]): Promise<EmbeddingResponse>;
}

export interface InferenceClient extends EmbeddingClient {
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
}

const mapInferenceOutputSchema = <
  T,
  S extends typeof serverConfig.inference.outputSchema,
>(
  opts: Record<S, T>,
  type: S,
): T => {
  return opts[type];
};

const mapOpenAIResponseFormat = (
  schema: z.ZodSchema | null,
  outputSchema: typeof serverConfig.inference.outputSchema,
) => {
  if (schema === null) {
    return undefined;
  }

  return mapInferenceOutputSchema(
    {
      structured: zodResponseFormat(schema, "schema"),
      json: { type: "json_object" as const },
      plain: undefined,
    },
    outputSchema,
  );
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

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  baseURL?: string;
  proxyUrl?: string;
  timeoutSec?: number;
}

const buildOpenAIClient = (config: OpenAIEmbeddingConfig) => {
  const timeoutMs = (config.timeoutSec ?? OpenAI.DEFAULT_TIMEOUT / 1000) * 1000;
  const timeoutOpts = { headersTimeout: timeoutMs, bodyTimeout: timeoutMs };
  const dispatcher = config.proxyUrl
    ? new undici.ProxyAgent({ uri: config.proxyUrl, ...timeoutOpts })
    : new undici.Agent(timeoutOpts);

  // Use undici's own fetch together with its Agent so that the fetch and the
  // dispatcher always come from the same undici copy. Passing an npm undici
  // Agent as the dispatcher of the runtime's built-in fetch fails immediately
  // on Node >= 24, which bundles a different undici major (undici 7).
  const fetchFn = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> =>
    undici
      .fetch(
        input as string | URL,
        {
          ...init,
          dispatcher,
        } as Parameters<typeof undici.fetch>[1],
      )
      .catch((error) => {
        logger.error(
          `OpenAI fetch to ${String(input)} failed: ${errorMessage(error)}`,
        );
        throw error;
      }) as unknown as Promise<Response>;

  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout:
      config.timeoutSec !== undefined ? config.timeoutSec * 1000 : undefined,
    defaultHeaders: {
      "X-Title": "Karakeep",
      "HTTP-Referer": "https://karakeep.app",
    },
    fetch: fetchFn,
  });
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause;
    if (
      cause instanceof Error &&
      cause.message &&
      cause.message !== error.message
    ) {
      return `${error.message}: ${cause.message}`;
    }
    return error.message;
  }
  return String(error);
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

export class EmbeddingClientFactory {
  static build(): EmbeddingClient | null {
    if (
      serverConfig.embedding.openAIApiKey ||
      serverConfig.embedding.openAIBaseUrl
    ) {
      const apiKey =
        serverConfig.embedding.openAIApiKey ??
        serverConfig.inference.openAIApiKey;
      if (!apiKey) {
        logger.error(
          "EMBEDDING_OPENAI_API_KEY or OPENAI_API_KEY must be set when using EMBEDDING_OPENAI_BASE_URL",
        );
        return null;
      }
      return new OpenAIEmbeddingClient({
        apiKey,
        baseURL:
          serverConfig.embedding.openAIBaseUrl ??
          serverConfig.inference.openAIBaseUrl,
        proxyUrl: serverConfig.inference.openAIProxyUrl,
        timeoutSec: serverConfig.inference.openAITimeoutSec,
      });
    }

    return InferenceClientFactory.build();
  }
}

export class OpenAIEmbeddingClient implements EmbeddingClient {
  private openAI: OpenAI;

  constructor(config: OpenAIEmbeddingConfig) {
    this.openAI = buildOpenAIClient(config);
  }

  async generateEmbeddingFromText(
    inputs: string[],
  ): Promise<EmbeddingResponse> {
    const embedResponse = await this.openAI.embeddings.create({
      model: serverConfig.embedding.textModel,
      input: inputs,
      encoding_format: "float",
      ...(serverConfig.embedding.textModelDimensionOverride !== undefined
        ? {
            dimensions: serverConfig.embedding.textModelDimensionOverride,
          }
        : {}),
    });
    const embeddings = parseEmbeddingResponse(embedResponse);
    validateEmbeddingDimensions(embeddings);
    const usage = parseEmbeddingUsage(embedResponse);
    return { embeddings, ...usage };
  }
}

export class OpenAIInferenceClient implements InferenceClient {
  openAI: OpenAI;
  private config: OpenAIInferenceConfig;

  constructor(config: OpenAIInferenceConfig) {
    this.config = config;

    this.openAI = buildOpenAIClient(config);
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
        response_format: mapOpenAIResponseFormat(
          optsWithDefaults.schema,
          this.config.outputSchema,
        ),
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
    const chatCompletion = await this.openAI.chat.completions.create(
      {
        model: this.config.imageModel,
        ...(this.config.serviceTier
          ? { service_tier: this.config.serviceTier }
          : {}),
        ...(this.config.useMaxCompletionTokens
          ? { max_completion_tokens: this.config.maxOutputTokens }
          : { max_tokens: this.config.maxOutputTokens }),
        response_format: mapOpenAIResponseFormat(
          optsWithDefaults.schema,
          this.config.outputSchema,
        ),
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
      encoding_format: "float",
      ...(serverConfig.embedding.textModelDimensionOverride !== undefined
        ? {
            dimensions: serverConfig.embedding.textModelDimensionOverride,
          }
        : {}),
    });
    const embedding2D = parseEmbeddingResponse(embedResponse);
    validateEmbeddingDimensions(embedding2D);
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
    const chatCompletion = await this.ollama.generate({
      model: model,
      format: mapInferenceOutputSchema(
        {
          // Use Zod 4's native JSON Schema emitter for Ollama structured output.
          structured: optsWithDefaults.schema
            ? z.toJSONSchema(optsWithDefaults.schema)
            : undefined,
          json: "json",
          plain: undefined,
        },
        this.config.outputSchema,
      ),
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
    validateEmbeddingDimensions(embedding.embeddings);
    const usage = parseEmbeddingUsage(embedding);
    return { embeddings: embedding.embeddings, ...usage };
  }
}
