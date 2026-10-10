import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ZOpenAIRequest } from "@karakeep/shared-server";
import type { InferenceClient } from "@karakeep/shared/inference";
import type { DequeuedJob } from "@karakeep/shared/queueing";
import { db } from "@karakeep/db";
import {
  bookmarks,
  bookmarkTexts,
  ruleEngineActionsTable,
  ruleEngineRulesTable,
  users,
} from "@karakeep/db/schema";
import { getVectorStoreClient } from "@karakeep/shared/vectorStore";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { runTagging } from "./tagging";

vi.mock("@karakeep/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@karakeep/db")>();
  const { getInMemoryDB } = await import("@karakeep/db/drizzle");
  return { ...actual, db: getInMemoryDB(true) };
});
vi.mock("network", () => ({ getBookmarkDomain: () => undefined }));
vi.mock("trpc", async () => {
  const { buildImpersonatingAuthedContext } =
    await import("@karakeep/trpc/lib/impersonate");
  return {
    buildImpersonatingAuthedContext,
    buildImpersonatingTRPCClient: vi.fn(),
  };
});
vi.mock("@karakeep/shared/vectorStore", () => ({
  getVectorStoreClient: vi.fn().mockResolvedValue(null),
}));

describe("AI tagging rules in the worker", () => {
  let userId: string;
  let bookmarkId: string;
  let job: DequeuedJob<ZOpenAIRequest>;
  const modelReached = new Error("Model called");
  const inferenceClient: InferenceClient = {
    inferFromText: vi.fn().mockRejectedValue(modelReached),
    inferFromImage: vi.fn(),
    generateEmbeddingFromText: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const [user] = await db
      .insert(users)
      .values({
        name: "Test user",
        email: crypto.randomUUID(),
        autoTaggingEnabled: true,
      })
      .returning();
    userId = user.id;
    const [bookmark] = await db
      .insert(bookmarks)
      .values({ userId, type: BookmarkTypes.TEXT, source: "rss" })
      .returning();
    bookmarkId = bookmark.id;
    await db
      .insert(bookmarkTexts)
      .values({ id: bookmarkId, text: "An article about testing AI tagging." });
    job = {
      id: "tagging-job",
      data: { bookmarkId, type: "tag" },
      priority: 0,
      runNumber: 0,
      abortSignal: new AbortController().signal,
    };
  });

  async function addRule(source: "rss" | "web", enabled = true) {
    const [rule] = await db
      .insert(ruleEngineRulesTable)
      .values({
        userId,
        name: "Skip tagging",
        enabled,
        event: JSON.stringify({ type: "beforeAiTagging" }),
        condition: JSON.stringify({ type: "bookmarkSourceIs", source }),
      })
      .returning();
    await db.insert(ruleEngineActionsTable).values({
      userId,
      ruleId: rule.id,
      action: JSON.stringify({ type: "skipAiTagging" }),
    });
  }

  it("skips the model and relevant-tag lookup when a rule matches", async () => {
    await addRule("rss");
    await runTagging(bookmarkId, job, inferenceClient);
    expect(inferenceClient.inferFromText).not.toHaveBeenCalled();
    expect(inferenceClient.inferFromImage).not.toHaveBeenCalled();
    expect(getVectorStoreClient).not.toHaveBeenCalled();
  });

  it.each(["no rule", "unmatched rule", "disabled rule"])(
    "continues to the model with %s",
    async (scenario) => {
      if (scenario === "unmatched rule") await addRule("web");
      if (scenario === "disabled rule") await addRule("rss", false);
      await expect(
        runTagging(bookmarkId, job, inferenceClient),
      ).rejects.toThrow(modelReached);
      expect(inferenceClient.inferFromText).toHaveBeenCalledOnce();
    },
  );
});
