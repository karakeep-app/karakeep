import { Ollama } from "ollama";
import OpenAI from "openai";
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
  // Responses API specific options
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  verbosity?: "low" | "medium" | "high";
  previousResponseId?: string;
  store?: boolean;
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

export class InferenceClientFactory {
  static build(): InferenceClient | null {
    if (serverConfig.inference.openAIApiKey) {
      return new OpenAIInferenceClient();
    }

    if (serverConfig.inference.ollamaBaseUrl) {
      return new OllamaInferenceClient();
    }
    return null;
  }
}

// OpenAI client using Responses API exclusively
class OpenAIInferenceClient implements InferenceClient {
  openAI: OpenAI;

  constructor() {
    this.openAI = new OpenAI({
      apiKey: serverConfig.inference.openAIApiKey,
      baseURL: serverConfig.inference.openAIBaseUrl,
      defaultHeaders: {
        "X-Title": "Karakeep",
        "HTTP-Referer": "https://karakeep.app",
      },
    });
  }

  private buildTextFormatOptions(
    model: string,
    optsWithDefaults: InferenceOptions,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textOptions: any = {};

    // Only GPT-5 models support verbosity parameter
    if (model.startsWith("gpt-5")) {
      textOptions.verbosity =
        optsWithDefaults.verbosity ||
        serverConfig.inference.verbosity ||
        "medium";
    }

    // Handle structured output
    if (optsWithDefaults.schema) {
      textOptions.format = {
        type: "json_schema",
        name: "response",
        strict: true,
        schema: zodToJsonSchema(optsWithDefaults.schema),
      };
    } else if (serverConfig.inference.outputSchema === "json") {
      textOptions.format = { type: "json" };
    } else {
      textOptions.format = { type: "text" };
    }

    return textOptions;
  }

  private buildRequestObject(
    model: string,
    input: string | unknown[],
    textOptions: unknown,
    optsWithDefaults: InferenceOptions,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestObj: any = {
      model,
      input,
      text: textOptions,
      store: optsWithDefaults.store ?? false,
      temperature: 1,
      top_p: 1,
    };

    // Handle reasoning parameter based on model capabilities
    if (model.startsWith("gpt-5")) {
      requestObj.reasoning = {
        effort:
          optsWithDefaults.reasoningEffort ||
          serverConfig.inference.reasoningEffort ||
          "low",
      };
    } else {
      // GPT-4 models need empty reasoning object
      requestObj.reasoning = {};
    }

    if (model.startsWith("gpt-4")) {
      requestObj.max_output_tokens = serverConfig.inference.maxOutputTokens;
    }

    if (optsWithDefaults.previousResponseId) {
      requestObj.previous_response_id = optsWithDefaults.previousResponseId;
    }

    return requestObj;
  }

  private extractAndProcessResponse(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response: any,
    optsWithDefaults: InferenceOptions,
  ): InferenceResponse {
    const outputText =
      response.output_text || response.output?.[0]?.content?.[0]?.text;
    if (!outputText) {
      throw new Error(`Got no output text from OpenAI Responses API`);
    }

    // Parse JSON if we're expecting structured output
    let finalResponse = outputText;
    if (
      optsWithDefaults.schema ||
      serverConfig.inference.outputSchema === "json"
    ) {
      try {
        finalResponse = JSON.stringify(JSON.parse(outputText));
      } catch {
        // If parsing fails, return as-is (might already be valid JSON string)
        finalResponse = outputText;
      }
    }

    return {
      response: finalResponse,
      totalTokens: response.usage?.total_tokens,
    };
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
    const textOptions = this.buildTextFormatOptions(model, optsWithDefaults);
    const requestObj = this.buildRequestObject(
      model,
      prompt,
      textOptions,
      optsWithDefaults,
    );

    const response = await this.openAI.responses.create(requestObj, {
      signal: optsWithDefaults.abortSignal,
    });

    return this.extractAndProcessResponse(response, optsWithDefaults);
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
    const textOptions = this.buildTextFormatOptions(model, optsWithDefaults);

    // Responses API handles images as part of structured input
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

    const requestObj = this.buildRequestObject(
      model,
      input,
      textOptions,
      optsWithDefaults,
    );

    const response = await this.openAI.responses.create(requestObj, {
      signal: optsWithDefaults.abortSignal,
    });

    return this.extractAndProcessResponse(response, optsWithDefaults);
  }

  async generateEmbeddingFromText(
    inputs: string[],
  ): Promise<EmbeddingResponse> {
    // Embeddings still use the same API
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

// Ollama client for local/self-hosted models
class OllamaInferenceClient implements InferenceClient {
  ollama: Ollama;

  constructor() {
    this.ollama = new Ollama({
      host: serverConfig.inference.ollamaBaseUrl,
      fetch: customFetch, // Use the custom fetch with configurable timeout
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
    const chatCompletion = await this.ollama.chat({
      model: model,
      format: mapInferenceOutputSchema(
        {
          structured: optsWithDefaults.schema
            ? zodToJsonSchema(optsWithDefaults.schema)
            : undefined,
          json: "json",
          plain: undefined,
        },
        serverConfig.inference.outputSchema,
      ),
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

    let totalTokens = 0;
    let response = "";
    try {
      for await (const part of chatCompletion) {
        response += part.message.content;
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
