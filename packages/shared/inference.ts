import { Ollama } from "ollama";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import * as undici from "undici";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import serverConfig from "./config";
import { customFetch } from "./customFetch";
import logger from "./logger";

export interface InferenceResponse {
  response: string;
  totalTokens: number | undefined;
}

export interface EmbeddingResponse {
  embeddings: number[][];
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

const mapInferenceOutputSchema = <
  T,
  S extends typeof serverConfig.inference.outputSchema,
>(
  opts: Record<S, T>,
  type: S,
): T => {
  return opts[type];
};

export interface OpenAIInferenceConfig {
  apiKey: string;
  baseURL?: string;
  proxyUrl?: string;
  textModel: string;
  imageModel: string;
  contextLength: number;
  maxOutputTokens: number;
  useMaxCompletionTokens: boolean;
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

    const fetchOptions = config.proxyUrl
      ? {
          dispatcher: new undici.ProxyAgent(config.proxyUrl),
        }
      : undefined;

    this.openAI = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      ...(fetchOptions ? { fetchOptions } : {}),
      defaultHeaders: {
        "X-Title": "Karakeep",
        "HTTP-Referer": "https://karakeep.app",
      },
    });
  }

  static fromConfig(): OpenAIInferenceClient {
    return new OpenAIInferenceClient({
      apiKey: serverConfig.inference.openAIApiKey!,
      baseURL: serverConfig.inference.openAIBaseUrl,
      proxyUrl: serverConfig.inference.openAIProxyUrl,
      textModel: serverConfig.inference.textModel,
      imageModel: serverConfig.inference.imageModel,
      contextLength: serverConfig.inference.contextLength,
      maxOutputTokens: serverConfig.inference.maxOutputTokens,
      useMaxCompletionTokens: serverConfig.inference.useMaxCompletionTokens,
      outputSchema: serverConfig.inference.outputSchema,
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
        ...(this.config.useMaxCompletionTokens
          ? { max_completion_tokens: this.config.maxOutputTokens }
          : { max_tokens: this.config.maxOutputTokens }),
        response_format: mapInferenceOutputSchema(
          {
            structured: optsWithDefaults.schema
              ? zodResponseFormat(optsWithDefaults.schema, "schema")
              : undefined,
            json: { type: "json_object" },
            plain: undefined,
          },
          this.config.outputSchema,
        ),
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
        ...(this.config.useMaxCompletionTokens
          ? { max_completion_tokens: this.config.maxOutputTokens }
          : { max_tokens: this.config.maxOutputTokens }),
        response_format: mapInferenceOutputSchema(
          {
            structured: optsWithDefaults.schema
              ? zodResponseFormat(optsWithDefaults.schema, "schema")
              : undefined,
            json: { type: "json_object" },
            plain: undefined,
          },
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
    });
    const embedding2D: number[][] = embedResponse.data.map(
      (embedding: OpenAI.Embedding) => embedding.embedding,
    );
    return { embeddings: embedding2D };
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
          structured: optsWithDefaults.schema
            ? zodToJsonSchema(optsWithDefaults.schema)
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
    return { embeddings: embedding.embeddings };
  }
}
