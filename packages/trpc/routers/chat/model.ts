import type { Model, Usage } from "@mariozechner/pi-ai";

import serverConfig from "@karakeep/shared/config";

function appendPath(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function getOllamaOpenAIBaseUrl(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  if (normalizedBaseUrl.endsWith("/v1")) {
    return normalizedBaseUrl;
  }

  return appendPath(normalizedBaseUrl, "v1");
}

function createChatModel(): Model<"openai-completions"> {
  const model = serverConfig.inference.chatModel;
  const maxTokensField: "max_completion_tokens" | "max_tokens" = serverConfig
    .inference.useMaxCompletionTokens
    ? "max_completion_tokens"
    : "max_tokens";
  const baseModelConfig = {
    id: model,
    name: model,
    api: "openai-completions" as const,
    reasoning: false,
    input: ["text"] satisfies Model<"openai-completions">["input"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: serverConfig.inference.contextLength,
    maxTokens: serverConfig.inference.maxOutputTokens,
  };

  if (serverConfig.inference.ollamaBaseUrl) {
    return {
      ...baseModelConfig,
      provider: "ollama",
      baseUrl: getOllamaOpenAIBaseUrl(serverConfig.inference.ollamaBaseUrl),
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        supportsStrictMode: false,
        maxTokensField,
      },
    };
  }

  return {
    ...baseModelConfig,
    provider: serverConfig.inference.openAIBaseUrl
      ? "openai-compatible"
      : "openai",
    baseUrl:
      serverConfig.inference.openAIBaseUrl ?? "https://api.openai.com/v1",
    compat: {
      maxTokensField,
    },
  };
}

export function getChatApiKey(provider: string) {
  if (provider === "ollama") {
    return "ollama";
  }

  return serverConfig.inference.openAIApiKey;
}

export const chatModel = createChatModel();

export const emptyUsage: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
};

export function addUsage(total: Usage, next: Usage): Usage {
  return {
    input: total.input + next.input,
    output: total.output + next.output,
    cacheRead: total.cacheRead + next.cacheRead,
    cacheWrite: total.cacheWrite + next.cacheWrite,
    totalTokens: total.totalTokens + next.totalTokens,
    cost: {
      input: total.cost.input + next.cost.input,
      output: total.cost.output + next.cost.output,
      cacheRead: total.cost.cacheRead + next.cost.cacheRead,
      cacheWrite: total.cost.cacheWrite + next.cost.cacheWrite,
      total: total.cost.total + next.cost.total,
    },
  };
}
