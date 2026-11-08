import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getInMemoryDB } from "@karakeep/db/drizzle";
import {
  bookmarkLinks,
  bookmarks,
  bookmarkTags,
  summaryProcessing,
  tagsOnBookmarks,
  users,
} from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import type { InferenceClient } from "@karakeep/shared/inference";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { beginSummaryAttempt, publishSummary } from "./summaryState";
import {
  enqueueSummaryTags,
  inferSummaryTags,
  resolveSummaryTags,
  summaryTagKey,
  tagPublishedSummary,
  SummaryTagError,
} from "./summaryTags";

const mocks = vi.hoisted(() => ({
  queue: vi.fn(),
  rule: vi.fn(),
  webhook: vi.fn(),
  index: vi.fn(),
}));
vi.mock("../queues", () => ({
  OpenAIQueue: { enqueue: mocks.queue },
  RuleEngineQueue: { enqueue: mocks.rule },
  WebhookQueue: { enqueue: mocks.webhook },
  triggerSearchReindex: mocks.index,
}));
vi.mock("@karakeep/shared/config", async (original) => {
  const actual = await original<typeof import("@karakeep/shared/config")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      summary: {
        ...actual.default.summary,
        provider: "notebooklm",
        autoTagsEnabled: true,
      },
    },
  };
});
let db: ReturnType<typeof getInMemoryDB>;
let generation: string;
const summary =
  "## Главное за 30 секунд\nИскусственный интеллект помогает автоматизировать обучение. ".repeat(
    8,
  );
const targets = ["искусственный интеллект", "образование", "автоматизация"];
const infer = (names = targets) =>
  vi.fn(
    async (
      _summary: string,
      existing: { id: string; name: string }[],
      curated: string[] | null,
    ) => resolveSummaryTags(names, existing, curated),
  );
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.clearAllMocks();
  serverConfig.summary.autoTagsEnabled = true;
  db = getInMemoryDB(true);
  db.insert(users)
    .values([
      { id: "owner", name: "Owner", email: "owner@test.local" },
      { id: "other", name: "Other", email: "other@test.local" },
    ])
    .run();
  db.insert(bookmarks)
    .values({ id: "link", userId: "owner", type: BookmarkTypes.LINK })
    .run();
  db.insert(bookmarkLinks)
    .values({
      id: "link",
      url: "https://youtube.com/watch?v=abcdefghijk",
      htmlContent: "Original source",
    })
    .run();
  const attempt = beginSummaryAttempt(db, "link", "owner", "youtube");
  generation = attempt.generation;
  publishSummary(db, attempt, {
    markdown: summary,
    provider: "notebooklm",
    tagging: true,
  });
});
function addTag(
  id: string,
  name: string,
  userId = "owner",
  attachedBy?: "human" | "ai",
) {
  db.insert(bookmarkTags).values({ id, userId, name }).run();
  if (attachedBy)
    db.insert(tagsOnBookmarks)
      .values({ tagId: id, bookmarkId: "link", attachedBy })
      .run();
}
const state = () => db.select().from(summaryProcessing).get()!;

describe("summary tags", () => {
  it("normalizes Unicode case, separators and known aliases without conflating C++ and C#", () => {
    expect(summaryTagKey(" #ИИ ")).toBe(
      summaryTagKey("artificial-intelligence"),
    );
    expect(summaryTagKey("МАШИННОЕ_ОБУЧЕНИЕ")).toBe(
      summaryTagKey("machine learning"),
    );
    expect(summaryTagKey("C++")).not.toBe(summaryTagKey("C#"));
    expect(() =>
      resolveSummaryTags(["AI", "ИИ", "искусственный интеллект"], [], null),
    ).toThrow();
  });
  it("repairs invalid or duplicate JSON once and prefers exact existing names", async () => {
    const existing = [
      { id: "ai", name: "AI" },
      { id: "education", name: "Образование" },
    ];
    const client = {
      inferFromText: vi
        .fn()
        .mockResolvedValueOnce({
          response: '{"tags":["AI","ИИ","искусственный интеллект"]}',
        })
        .mockResolvedValueOnce({
          response:
            '```json\n{"tags":["ИИ","образование","автоматизация"]}\n```',
        }),
    } as unknown as InferenceClient;
    const result = await inferSummaryTags(
      summary,
      existing,
      null,
      "lowercase-spaces",
      signal(),
      client,
    );
    expect(result).toEqual([
      { name: "AI", existingId: "ai" },
      { name: "Образование", existingId: "education" },
      { name: "автоматизация" },
    ]);
    expect(client.inferFromText).toHaveBeenCalledTimes(2);
    expect(vi.mocked(client.inferFromText).mock.calls[0][0]).toContain(
      JSON.stringify(summary),
    );
  });
  it("rejects invented English labels, excessive output and malformed replies with bounded calls", async () => {
    const client = {
      inferFromText: vi.fn().mockResolvedValue({
        response: '{"tags":["interesting","video","article"]}',
      }),
    } as unknown as InferenceClient;
    await expect(
      inferSummaryTags(summary, [], null, "as-generated", signal(), client),
    ).rejects.toMatchObject({ code: "invalid_response" });
    expect(client.inferFromText).toHaveBeenCalledTimes(2);
    vi.mocked(client.inferFromText)
      .mockReset()
      .mockResolvedValue({ response: "x".repeat(9000), totalTokens: 0 });
    await expect(
      inferSummaryTags(summary, [], null, "as-generated", signal(), client),
    ).rejects.toThrow();
    expect(client.inferFromText).toHaveBeenCalledTimes(2);
  });
  it("does not silently truncate a summary that exceeds the model context", async () => {
    const client = { inferFromText: vi.fn() } as unknown as InferenceClient;
    await expect(
      inferSummaryTags(
        summary.repeat(10),
        [],
        null,
        "as-generated",
        signal(),
        client,
        2048,
      ),
    ).rejects.toMatchObject({ code: "too_large" });
    expect(client.inferFromText).not.toHaveBeenCalled();
  });
  it("honors a small curated vocabulary and permits fewer than three matching tags", async () => {
    const existing = [
      { id: "one", name: "образование" },
      { id: "two", name: "обучение" },
      { id: "off", name: "спорт" },
    ];
    const client = {
      inferFromText: vi
        .fn()
        .mockResolvedValue({ response: '{"tags":["образование","обучение"]}' }),
    } as unknown as InferenceClient;
    const result = await inferSummaryTags(
      summary,
      existing,
      ["one", "two"],
      "as-generated",
      signal(),
      client,
    );
    expect(result).toHaveLength(2);
    expect(vi.mocked(client.inferFromText).mock.calls[0][0]).not.toContain(
      '"спорт"',
    );
  });
  it("reuses owner tags, preserves human attachments, replaces only AI tags and is idempotent", async () => {
    addTag("ai", "AI", "owner", "human");
    addTag("education", "Образование");
    addTag("manual", "мой ручной тег", "owner", "human");
    addTag("old", "старый тег", "owner", "ai");
    addTag("other-tag", "автоматизация", "other");
    const generate = infer();
    expect(
      await tagPublishedSummary(
        db,
        "link",
        "owner",
        generation,
        undefined,
        generate,
      ),
    ).toEqual({ tagged: true });
    const attached = db.select().from(tagsOnBookmarks).all();
    expect(attached.find((t) => t.tagId === "ai")?.attachedBy).toBe("human");
    expect(attached.find((t) => t.tagId === "manual")?.attachedBy).toBe(
      "human",
    );
    expect(attached.find((t) => t.tagId === "education")?.attachedBy).toBe(
      "ai",
    );
    expect(
      attached.some((t) => t.tagId === "old" || t.tagId === "other-tag"),
    ).toBe(false);
    expect(
      db
        .select()
        .from(bookmarkTags)
        .all()
        .filter((t) => t.userId === "owner" && t.name === "автоматизация"),
    ).toHaveLength(1);
    expect(generate.mock.calls[0][1].some((t) => t.id === "other-tag")).toBe(
      false,
    );
    expect(state()).toMatchObject({
      status: "success",
      taggingStatus: "success",
      taggedSummaryHash: state().summaryHash,
    });
    expect(db.select().from(bookmarks).get()?.summary).toBe(summary);
    await tagPublishedSummary(
      db,
      "link",
      "owner",
      generation,
      undefined,
      generate,
    );
    expect(generate).toHaveBeenCalledOnce();
    expect(mocks.rule).toHaveBeenCalledOnce();
    expect(mocks.index).toHaveBeenCalledOnce();
  });
  it("isolates tagging failures from the published summary and can retry", async () => {
    addTag("old", "старый", "owner", "ai");
    const broken = vi
      .fn()
      .mockRejectedValue(new Error("private response and token"));
    await expect(
      tagPublishedSummary(db, "link", "owner", generation, undefined, broken),
    ).rejects.toThrow("Summary tagging failed: provider");
    expect(state()).toMatchObject({
      status: "success",
      taggingStatus: "failure",
      taggingErrorCode: "provider",
    });
    expect(db.select().from(bookmarks).get()).toMatchObject({
      summary,
      summarizationStatus: "success",
      taggingStatus: "failure",
    });
    expect(db.select().from(tagsOnBookmarks).all()).toHaveLength(1);
    await tagPublishedSummary(
      db,
      "link",
      "owner",
      generation,
      undefined,
      infer(),
    );
    expect(state().taggingStatus).toBe("success");
  });
  it("never publishes old tags after another summary generation starts", async () => {
    const generate = vi.fn(async () => {
      beginSummaryAttempt(db, "link", "owner", "youtube");
      return targets.map((name) => ({ name }));
    });
    await tagPublishedSummary(
      db,
      "link",
      "owner",
      generation,
      undefined,
      generate,
    );
    expect(db.select().from(bookmarkTags).all()).toHaveLength(0);
    expect(state()).toMatchObject({ status: "pending", taggingStatus: null });
    expect(db.select().from(bookmarks).get()?.taggingStatus).toBeNull();
  });
  it("rejects changes to the summary body even when generation did not change", async () => {
    const generate = vi.fn(async () => {
      db.update(bookmarks).set({ summary: "Changed manually" }).run();
      return targets.map((name) => ({ name }));
    });
    await tagPublishedSummary(
      db,
      "link",
      "owner",
      generation,
      undefined,
      generate,
    );
    expect(db.select().from(bookmarkTags).all()).toHaveLength(0);
    expect(state()).toMatchObject({
      taggingStatus: "failure",
      taggingErrorCode: "source_changed",
    });
  });
  it("honors disabled user/server settings and ownership before contacting Hermes", async () => {
    const generate = infer();
    await tagPublishedSummary(
      db,
      "link",
      "other",
      generation,
      undefined,
      generate,
    );
    db.update(users)
      .set({ autoTaggingEnabled: false })
      .where(eq(users.id, "owner"))
      .run();
    await tagPublishedSummary(
      db,
      "link",
      "owner",
      generation,
      undefined,
      generate,
    );
    expect(generate).not.toHaveBeenCalled();
    expect(state().taggingStatus).toBeNull();
    db.update(users).set({ autoTaggingEnabled: true }).run();
    serverConfig.summary.autoTagsEnabled = false;
    await tagPublishedSummary(
      db,
      "link",
      "owner",
      generation,
      undefined,
      generate,
    );
    expect(generate).not.toHaveBeenCalled();
  });
  it("rechecks user preferences after a slow response", async () => {
    const generate = vi.fn(async () => {
      db.update(users).set({ autoTaggingEnabled: false }).run();
      return targets.map((name) => ({ name }));
    });
    await tagPublishedSummary(
      db,
      "link",
      "owner",
      generation,
      undefined,
      generate,
    );
    expect(db.select().from(bookmarkTags).all()).toHaveLength(0);
    expect(state().taggingStatus).toBeNull();
  });
  it("rejects an existing tag deleted while Hermes was responding", async () => {
    addTag("ai", "ИИ");
    const generate = vi.fn(async () => {
      db.delete(bookmarkTags).where(eq(bookmarkTags.id, "ai")).run();
      return [
        { name: "ИИ", existingId: "ai" },
        { name: "образование" },
        { name: "автоматизация" },
      ];
    });
    await tagPublishedSummary(
      db,
      "link",
      "owner",
      generation,
      undefined,
      generate,
    );
    expect(db.select().from(bookmarkTags).all()).toHaveLength(0);
    expect(state().taggingErrorCode).toBe("source_changed");
  });
  it("does not downgrade a successful duplicate job when a delayed duplicate fails", async () => {
    let reject!: (e: Error) => void;
    const late = tagPublishedSummary(
      db,
      "link",
      "owner",
      generation,
      undefined,
      () =>
        new Promise((_r, fail) => {
          reject = fail;
        }),
    );
    await tagPublishedSummary(
      db,
      "link",
      "owner",
      generation,
      undefined,
      infer(),
    );
    reject(new Error("old failure"));
    await expect(late).rejects.toThrow();
    expect(state().taggingStatus).toBe("success");
    expect(db.select().from(bookmarks).get()?.taggingStatus).toBe("success");
  });
  it("queues with a generation/hash key and keeps summary success on enqueue failure", async () => {
    mocks.queue.mockRejectedValueOnce(new Error("private queue failure"));
    expect(await enqueueSummaryTags(db, "link", "owner", generation)).toBe(
      false,
    );
    expect(state()).toMatchObject({
      status: "success",
      taggingStatus: "failure",
    });
    expect(mocks.queue.mock.calls[0][0]).toEqual({
      bookmarkId: "link",
      type: "summary_tags",
      summaryGeneration: generation,
    });
    expect(mocks.queue.mock.calls[0][1].idempotencyKey).toContain(generation);
    expect(db.select().from(bookmarks).get()?.summary).toBe(summary);
  });
  it("does not retry permanent Hermes errors or leak their response", async () => {
    for (const [status, code] of [
      [401, "auth"],
      [429, "quota"],
    ] as const) {
      await tagPublishedSummary(
        db,
        "link",
        "owner",
        generation,
        undefined,
        vi.fn().mockRejectedValue({ status, message: "private" }),
      );
      expect(state()).toMatchObject({
        taggingStatus: "failure",
        taggingErrorCode: code,
      });
    }
    await tagPublishedSummary(
      db,
      "link",
      "owner",
      generation,
      undefined,
      vi.fn().mockRejectedValue(new SummaryTagError("invalid_response")),
    );
    expect(state().taggingErrorCode).toBe("invalid_response");
  });
});

it("accepts technical acronyms while rejecting markup and URLs as newly generated names", () => {
  expect(
    resolveSummaryTags(["MCP", "образование", "память"], [], null),
  ).toContainEqual({ name: "MCP" });
  expect(() =>
    resolveSummaryTags(["<b>образование</b>", "память", "обучение"], [], null),
  ).toThrow();
  expect(() =>
    resolveSummaryTags(["https://пример.рф", "память", "обучение"], [], null),
  ).toThrow();
});
