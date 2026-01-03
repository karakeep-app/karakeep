import { Ollama } from "ollama";
import { zodToJsonSchema } from "zod-to-json-schema";

import type {
  EmbeddingClient,
  EmbeddingResponse,
  InferenceClient,
  InferenceOptions,
  InferenceResponse,
} from "./types";
import serverConfig from "../config";
import { customFetch } from "../customFetch";
import logger from "../logger";
import { defaultInferenceOptions } from "./types";

/**
 * Ollama Inference Client
 *
 * Uses Ollama's local API for self-hosted LLM inference.
 */
export class OllamaInferenceClient implements InferenceClient {
  ollama: Ollama;

  constructor() {
    this.ollama = new Ollama({
      host: serverConfig.inference.ollamaBaseUrl,
      fetch: customFetch,
    });
  }

  async runModel(
    model: string,
    prompt: string,
    opts: InferenceOptions,
    image?: string,
  ): Promise<InferenceResponse> {
    // Set up abort handling with addEventListener for automatic cleanup
    // Using { once: true } ensures the handler is removed after firing
    if (opts.abortSignal) {
      opts.abortSignal.addEventListener(
        "abort",
        () => {
          this.ollama.abort();
        },
        { once: true },
      );
    }

    const outputSchema = serverConfig.inference.outputSchema;
    let format: "json" | object | undefined;

    if (outputSchema === "structured" && opts.schema) {
      format = zodToJsonSchema(opts.schema);
    } else if (outputSchema === "json") {
      format = "json";
    }

    const chatCompletion = await this.ollama.chat({
      model,
      format,
      stream: true,
      keep_alive: serverConfig.inference.ollamaKeepAlive,
      options: {
        num_ctx: serverConfig.inference.contextLength,
        num_predict: serverConfig.inference.maxOutputTokens,
      },
      messages: [
        { role: "user", content: prompt, images: image ? [image] : undefined },
      ],
    });

    let totalTokens: number | undefined = 0;
    let response = "";
    try {
      for await (const part of chatCompletion) {
        response += part.message.content;
        if (part.eval_count !== undefined) {
          totalTokens += part.eval_count;
        }
        if (part.prompt_eval_count !== undefined) {
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
      totalTokens = undefined;
      logger.warn(
        `Got an exception from ollama, will still attempt to deserialize the response we got so far: ${e}`,
      );
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
      serverConfig.inference.textModel,
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
      serverConfig.inference.imageModel,
      prompt,
      optsWithDefaults,
      image,
    );
  }
}

/**
 * Ollama Embedding Client
 *
 * Uses Ollama's embed API for local text embeddings.
 */
export class OllamaEmbeddingClient implements EmbeddingClient {
  ollama: Ollama;

  constructor() {
    this.ollama = new Ollama({
      host: serverConfig.inference.ollamaBaseUrl,
      fetch: customFetch,
    });
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
