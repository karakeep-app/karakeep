import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

export interface InferenceOptions {
  schema: z.ZodSchema<any> | null;
}

export interface InferenceResponse {
  response: string;
  totalTokens: number | undefined;
}

export class InferenceClient {
  private client: OpenAI;

  constructor(apiKey: string, baseUrl?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      defaultHeaders: {
        "X-Title": "Karakeep Model Comparison",
      },
    });
  }

  async inferTags(
    content: string,
    model: string,
    lang: string = "english",
    customPrompts: string[] = [],
  ): Promise<string[]> {
    const tagsSchema = z.object({
      tags: z.array(z.string()),
    });

    const response = await this.inferFromText(
      this.buildPrompt(content, lang, customPrompts),
      model,
      { schema: tagsSchema },
    );

    const parsed = tagsSchema.safeParse(
      this.parseJsonFromResponse(response.response),
    );
    if (!parsed.success) {
      throw new Error(
        `Failed to parse model response: ${parsed.error.message}`,
      );
    }

    return parsed.data.tags;
  }

  private async inferFromText(
    prompt: string,
    model: string,
    opts: InferenceOptions,
  ): Promise<InferenceResponse> {
    const chatCompletion = await this.client.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: model,
      response_format: opts.schema
        ? zodResponseFormat(opts.schema, "schema")
        : { type: "json_object" as const },
    });

    const response = chatCompletion.choices[0].message.content;
    if (!response) {
      throw new Error("Got no message content from model");
    }

    return {
      response,
      totalTokens: chatCompletion.usage?.total_tokens,
    };
  }

  private buildPrompt(
    content: string,
    lang: string,
    customPrompts: string[],
  ): string {
    return `
You are an expert whose responsibility is to help with automatic tagging for a read-it-later app.
Please analyze the TEXT_CONTENT below and suggest relevant tags that describe its key themes, topics, and main ideas. The rules are:
- Aim for a variety of tags, including broad categories, specific keywords, and potential sub-genres.
- The tags must be in ${lang}.
- If tag is not generic enough, don't include it.
- The content can include text for cookie consent and privacy policy, ignore those while tagging.
- Aim for 3-5 tags.
- If there are no good tags, leave the array empty.
${customPrompts.map((p) => `- ${p}`).join("\n")}

<TEXT_CONTENT>
${content}
</TEXT_CONTENT>
You must respond in JSON with key "tags" and the value is an array of string tags.`;
  }

  private parseJsonFromResponse(response: string): unknown {
    const trimmedResponse = response.trim();

    try {
      return JSON.parse(trimmedResponse);
    } catch {
      const jsonBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i;
      const match = trimmedResponse.match(jsonBlockRegex);

      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch {}
      }

      const jsonObjectRegex = /\{[\s\S]*\}/;
      const objectMatch = trimmedResponse.match(jsonObjectRegex);

      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch {}
      }

      return JSON.parse(trimmedResponse);
    }
  }
}
