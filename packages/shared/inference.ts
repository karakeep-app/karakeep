import { Ollama } from "ollama";
import OpenAI from "openai";

import serverConfig from "./config";
import logger from "./logger";
import { customFetch } from "./customFetch";

export interface InferenceResponse {
  response: string;
  totalTokens: number | undefined;
}

export interface InferenceOptions {
  json: boolean;
}

const defaultInferenceOptions: InferenceOptions = {
  json: true,
};

export interface InferenceClient {
  inferFromText(
    prompt: string,
    opts: InferenceOptions,
  ): Promise<InferenceResponse>;
  inferFromImage(
    prompt: string,
    contentType: string,
    image: string,
    opts: InferenceOptions,
  ): Promise<InferenceResponse>;
}

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

class OpenAIInferenceClient implements InferenceClient {
  openAI: OpenAI;

  constructor() {
    this.openAI = new OpenAI({
      apiKey: serverConfig.inference.openAIApiKey,
      baseURL: serverConfig.inference.openAIBaseUrl,
    });
  }

  async inferFromText(
    prompt: string,
    opts: InferenceOptions = defaultInferenceOptions,
  ): Promise<InferenceResponse> {
    const chatCompletion = await this.openAI.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: serverConfig.inference.textModel,
      response_format: opts.json ? { type: "json_object" } : undefined,
    });

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
    opts: InferenceOptions = defaultInferenceOptions,
  ): Promise<InferenceResponse> {
    const chatCompletion = await this.openAI.chat.completions.create({
      model: serverConfig.inference.imageModel,
      response_format: opts.json ? { type: "json_object" } : undefined,
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
      max_tokens: 2000,
    });

    const response = chatCompletion.choices[0].message.content;
    if (!response) {
      throw new Error(`Got no message content from OpenAI`);
    }
    return { response, totalTokens: chatCompletion.usage?.total_tokens };
  }
}

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
    image?: string,
    opts: InferenceOptions = defaultInferenceOptions,
  ) {
    const chatCompletion = await this.ollama.chat({
      model: model,
      format: opts.json ? "json" : undefined,
      stream: true,
      keep_alive: serverConfig.inference.ollamaKeepAlive,
      options: {
        num_ctx: serverConfig.inference.contextLength,
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
      // There seem to be some bug in ollama where you can get some successfull response, but still throw an error.
      // Using stream + accumulating the response so far is a workaround.
      // https://github.com/ollama/ollama-js/issues/72
      totalTokens = NaN;
      logger.warn(
        `Got an exception from ollama, will still attempt to deserialize the response we got so far: ${e}`,
      );
    }

    return { response, totalTokens };
  }

  async inferFromText(
    prompt: string,
    opts: InferenceOptions = defaultInferenceOptions,
  ): Promise<InferenceResponse> {
    return await this.runModel(
      serverConfig.inference.textModel,
      prompt,
      undefined,
      opts,
    );
  }

  async inferFromImage(
    prompt: string,
    _contentType: string,
    image: string,
    opts: InferenceOptions = defaultInferenceOptions,
  ): Promise<InferenceResponse> {
    return await this.runModel(
      serverConfig.inference.imageModel,
      prompt,
      image,
      opts,
    );
  }
}
