import { describe, expect, it, vi } from "vitest";

import serverConfig from "@karakeep/shared/config";
import type { OpenAIInferenceClient } from "@karakeep/shared/inference";
import {
  splitSummarySource,
  summaryTokenCount,
} from "@karakeep/shared/summaryText";

import {
  buildHermesSummaryClient,
  generateSourceSummary,
  summarizeWithHermes,
  summarizeWithNotebook,
  summaryInstructions,
  SummaryProviderError,
} from "./summaryProviders";
import type { SummaryAttempt } from "./summaryState";

vi.mock("@karakeep/shared/config", async (original) => {
  const actual = await original<typeof import("@karakeep/shared/config")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      summary: {
        ...actual.default.summary,
        notebooklmUrl: "http://adapter:8000",
        notebooklmToken: "private-adapter-token",
        hermesUrl: "http://summary-gateway:8643/v1",
        hermesApiKey: "private-hermes-key",
        hermesModel: "hermes-agent",
      },
    },
  };
});

const attempt: SummaryAttempt = {
  bookmarkId: "bookmark",
  userId: "owner",
  generation: "d3caa4e4-ef15-43e3-9bd0-d4caa7771ac1",
  sourceVersion: "version",
  sourceUrl: "https://example.com/article",
  sourceType: "article",
};
const body = "Complete source text. ".repeat(50);
const input = () => ({
  attempt,
  text: body,
  instructions: summaryInstructions(["Keep useful details"]),
  onSource: vi.fn().mockResolvedValue(undefined),
});

describe("summary adapters", () => {
  it("keeps Hermes separate from global inference and disables SDK retries", () => {
    const client = buildHermesSummaryClient() as OpenAIInferenceClient;
    expect(client.openAI.baseURL).toBe("http://summary-gateway:8643/v1");
    expect(client.openAI.apiKey).toBe("private-hermes-key");
    expect(client.openAI.maxRetries).toBe(0);
    expect(serverConfig.inference.openAIBaseUrl).not.toBe(
      client.openAI.baseURL,
    );
  });

  it("normalizes both provider prompts to Russian Markdown with custom instructions", () => {
    const instructions = summaryInstructions(["Keep source quotes"]);
    expect(instructions).toContain("на русском языке в Markdown");
    expect(instructions).toContain("Keep source quotes");
  });

  it("retains exact source across Unicode chunk boundaries", () => {
    const original = "Русский текст, 日本語 и emoji 😀. ".repeat(100);
    const parts = splitSummarySource(original, 128);
    expect(parts.join("")).toBe(original);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => summaryTokenCount(p) <= 128)).toBe(true);
  });

  it("covers the last part and synthesizes ordered partial summaries within context", async () => {
    const source =
      "paragraph number with useful details. ".repeat(500) + "UNIQUE_LAST_FACT";
    const prompts: string[] = [];
    const client = {
      inferFromText: vi.fn(async (prompt: string) => {
        prompts.push(prompt);
        return { response: `# Part ${prompts.length}`, totalTokens: 0 };
      }),
      inferFromImage: vi.fn(),
      generateEmbeddingFromText: vi.fn(),
    };
    const result = await summarizeWithHermes(
      source,
      "Summarize in Russian",
      new AbortController().signal,
      client,
      1024,
      128,
    );
    expect(prompts.some((p) => p.includes("UNIQUE_LAST_FACT"))).toBe(true);
    expect(prompts.at(-1)).toContain("Объедини конспекты");
    expect(prompts.at(-1)!.indexOf("# Part 1")).toBeLessThan(
      prompts.at(-1)!.indexOf("# Part 2"),
    );
    expect(prompts.every((p) => summaryTokenCount(p) + 128 <= 1024)).toBe(true);
    expect(result).toMatch(/^# Part/);
  });

  it("fails on intermediate empty responses instead of silently skipping a chunk", async () => {
    const client = {
      inferFromText: vi
        .fn()
        .mockResolvedValueOnce({ response: "# First" })
        .mockResolvedValue({ response: "" }),
      inferFromImage: vi.fn(),
      generateEmbeddingFromText: vi.fn(),
    };
    await expect(
      summarizeWithHermes(
        body.repeat(30),
        "Summary",
        new AbortController().signal,
        client,
        1024,
        128,
      ),
    ).rejects.toBeInstanceOf(SummaryProviderError);
  });

  it("reads an imported URL, preserves extracted text before surfacing generation failure", async () => {
    const onSource = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "failure",
          full_text: body,
          markdown: null,
          error_code: "quota",
          notebook_id: "nb",
        }),
      ),
    );
    await expect(
      summarizeWithNotebook(
        attempt,
        undefined,
        "Prompt",
        new AbortController().signal,
        onSource,
        request,
      ),
    ).rejects.toMatchObject({ code: "quota" });
    const posted = JSON.parse(request.mock.calls[0][1].body);
    expect(posted.url).toBe(attempt.sourceUrl);
    expect(posted.text).toBeNull();
    expect(onSource).toHaveBeenCalledWith(body, "nb");
  });

  it("retries ambiguous POST with the same operation ID", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection closed"))
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "success",
            full_text: body,
            markdown: "# Result",
            error_code: null,
            notebook_id: null,
          }),
        ),
      );
    expect(
      await summarizeWithNotebook(
        attempt,
        undefined,
        "Prompt",
        new AbortController().signal,
        vi.fn(),
        request,
      ),
    ).toBe("# Result");
    expect(request.mock.calls[0][1].body).toBe(request.mock.calls[1][1].body);
  });
});

describe("NotebookLM then Hermes policy", () => {
  it("does not call Hermes after NotebookLM success", async () => {
    const providers = {
      notebook: vi.fn().mockResolvedValue("# Notebook"),
      hermes: vi.fn(),
    };
    expect(await generateSourceSummary(input(), providers)).toEqual({
      markdown: "# Notebook",
      provider: "notebooklm",
    });
    expect(providers.hermes).not.toHaveBeenCalled();
  });

  it.each(["auth", "quota", "timeout", "provider"])(
    "falls back on %s with article text",
    async (code) => {
      const providers = {
        notebook: vi.fn().mockRejectedValue(new Error(code)),
        hermes: vi.fn().mockResolvedValue("# Hermes"),
      };
      expect(await generateSourceSummary(input(), providers)).toEqual({
        markdown: "# Hermes",
        provider: "hermes",
      });
      expect(providers.hermes.mock.calls[0][0]).toBe(body);
    },
  );

  it("falls back on empty NotebookLM response", async () => {
    const providers = {
      notebook: vi.fn().mockResolvedValue(""),
      hermes: vi.fn().mockResolvedValue("# Hermes"),
    };
    expect((await generateSourceSummary(input(), providers)).provider).toBe(
      "hermes",
    );
  });

  it("does not summarize video metadata when transcript is absent", async () => {
    const providers = {
      notebook: vi.fn().mockRejectedValue(new SummaryProviderError("no_text")),
      hermes: vi.fn(),
    };
    await expect(
      generateSourceSummary({ ...input(), text: undefined }, providers),
    ).rejects.toMatchObject({ code: "no_text" });
    expect(providers.hermes).not.toHaveBeenCalled();
  });

  it("uses transcript extracted before a NotebookLM generation failure", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const providers = {
      notebook: vi.fn(
        async (_attempt, _text, _instructions, _signal, onSource) => {
          await onSource(body, "nb");
          throw new SummaryProviderError("quota");
        },
      ),
      hermes: vi.fn().mockResolvedValue("# Video"),
    };
    const result = await generateSourceSummary(
      { ...input(), text: undefined, onSource: save },
      providers,
    );
    expect(result.provider).toBe("hermes");
    expect(save).toHaveBeenCalledWith(body, "nb");
    expect(providers.hermes.mock.calls[0][0]).toBe(body);
  });

  it("caps retries and never leaks upstream details on two provider failures", async () => {
    const providers = {
      notebook: vi.fn().mockRejectedValue(new Error("secret cookie")),
      hermes: vi.fn().mockRejectedValue(new Error("private source")),
    };
    await expect(generateSourceSummary(input(), providers)).rejects.toThrow(
      "Summary generation failed: provider",
    );
    expect(providers.hermes).toHaveBeenCalledTimes(
      serverConfig.summary.maxAttempts,
    );
  });

  it("does not use fallback when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const providers = {
      notebook: vi.fn().mockRejectedValue(new Error()),
      hermes: vi.fn(),
    };
    await expect(
      generateSourceSummary(
        { ...input(), signal: controller.signal },
        providers,
      ),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(providers.hermes).not.toHaveBeenCalled();
  });
});

it("enforces the total job deadline before falling back", async () => {
  const saved = serverConfig.summary.jobTimeoutSec;
  serverConfig.summary.jobTimeoutSec = 0.01;
  const providers = {
    notebook: vi.fn(
      async (_attempt, _text, _instructions, signal: AbortSignal) => {
        await new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("expired")), {
            once: true,
          }),
        );
        return "unreachable";
      },
    ),
    hermes: vi.fn(),
  };
  try {
    await expect(
      generateSourceSummary(input(), providers),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(providers.hermes).not.toHaveBeenCalled();
  } finally {
    serverConfig.summary.jobTimeoutSec = saved;
  }
});

it("reports the NotebookLM failure before switching to Hermes without exposing upstream errors", async () => {
  const progress = vi.fn();
  const result = await generateSourceSummary(
    { ...input(), onProgress: progress },
    {
      notebook: vi.fn().mockRejectedValue(new SummaryProviderError("auth")),
      hermes: vi.fn().mockResolvedValue("## Главное за 30 секунд\nГотово"),
    },
  );
  expect(progress.mock.calls.map((c) => c[0])).toEqual([
    { stage: "notebooklm" },
    { stage: "notebooklm", notebookErrorCode: "auth" },
    { stage: "hermes" },
  ]);
  expect(result.provider).toBe("hermes");
});

it.each(["provider", "timeout", "auth", "quota"] as const)(
  "preserves NotebookLM %s when no transcript is available, without calling Hermes",
  async (code) => {
    const hermes = vi.fn();
    const progress = vi.fn();
    await expect(
      generateSourceSummary(
        { ...input(), text: undefined, onProgress: progress },
        {
          notebook: vi.fn().mockRejectedValue(new SummaryProviderError(code)),
          hermes,
        },
      ),
    ).rejects.toMatchObject({ code });
    expect(hermes).not.toHaveBeenCalled();
    expect(progress).toHaveBeenLastCalledWith({
      stage: "notebooklm",
      notebookErrorCode: code,
    });
  },
);
