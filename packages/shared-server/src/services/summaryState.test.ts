import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { getInMemoryDB } from "@karakeep/db/drizzle";
import {
  bookmarkLinks,
  bookmarks,
  summaryProcessing,
  users,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import {
  beginSummaryAttempt,
  failSummaryAttempt,
  getPublishedReaderSummary,
  invalidateChangedSummarySource,
  publishSummary,
} from "./summaryState";

let db: ReturnType<typeof getInMemoryDB>;
beforeEach(() => {
  db = getInMemoryDB(true);
  db.run(sql`PRAGMA foreign_keys = ON`);
  db.insert(users)
    .values({ id: "owner", email: "owner@test.local", name: "Owner" })
    .run();
  db.insert(bookmarks)
    .values({
      id: "link",
      userId: "owner",
      type: BookmarkTypes.LINK,
      summary: "Old summary",
    })
    .run();
  db.insert(bookmarkLinks)
    .values({
      id: "link",
      url: "https://example.com/article",
      htmlContent: "<p>Original</p>",
    })
    .run();
});
const begin = () => beginSummaryAttempt(db, "link", "owner", "article");
const publish = (attempt: ReturnType<typeof begin>, markdown = "# Result") =>
  publishSummary(db, attempt, { markdown, provider: "notebooklm" });

describe("summary publication", () => {
  it("publishes atomically and leaves the source unchanged", () => {
    const source = db.select().from(bookmarkLinks).get();
    expect(publish(begin())).toBe(true);
    expect(getPublishedReaderSummary(db, "link", "owner")).toBe("# Result");
    expect(db.select().from(bookmarkLinks).get()).toEqual(source);
    expect(db.select().from(summaryProcessing).get()?.provider).toBe(
      "notebooklm",
    );
  });

  it("fences late success and failure from a previous generation", () => {
    const stale = begin();
    const latest = begin();
    expect(publish(stale, "Stale")).toBe(false);
    expect(failSummaryAttempt(db, stale, "timeout")).toBe(false);
    expect(db.select().from(bookmarks).get()?.summarizationStatus).toBe(
      "pending",
    );
    expect(publish(latest, "Latest")).toBe(true);
    expect(publish(stale, "Stale")).toBe(false);
    expect(failSummaryAttempt(db, latest, "provider")).toBe(false);
    expect(getPublishedReaderSummary(db, "link", "owner")).toBe("Latest");
  });

  it.each([
    { url: "https://example.com/changed" },
    { htmlContent: "<p>Changed</p>" },
    { contentAssetId: "immutable-new-body" },
  ])("rejects a late result after source update %o", (change) => {
    const attempt = begin();
    db.update(bookmarkLinks)
      .set(change)
      .where(eq(bookmarkLinks.id, "link"))
      .run();
    expect(publish(attempt)).toBe(false);
    expect(failSummaryAttempt(db, attempt, "provider")).toBe(false);
    expect(invalidateChangedSummarySource(db, "link", "owner")).toBe(true);
    expect(invalidateChangedSummarySource(db, "link", "owner")).toBe(false);
    expect(getPublishedReaderSummary(db, "link", "owner")).toBeNull();
    expect(db.select().from(summaryProcessing).get()?.errorCode).toBe(
      "source_changed",
    );
  });

  it("does not expose a published result after its source changes", () => {
    publish(begin());
    db.update(bookmarkLinks).set({ htmlContent: "Updated" }).run();
    expect(getPublishedReaderSummary(db, "link", "owner")).toBeNull();
  });

  it("preserves stored success if regeneration fails but returns original eligibility", () => {
    publish(begin());
    const retry = begin();
    expect(getPublishedReaderSummary(db, "link", "owner")).toBeNull();
    expect(failSummaryAttempt(db, retry, "provider")).toBe(true);
    expect(db.select().from(bookmarks).get()?.summary).toBe("# Result");
    expect(getPublishedReaderSummary(db, "link", "owner")).toBeNull();
  });

  it("rejects deleted bookmarks and does not recreate their state", () => {
    const attempt = begin();
    db.delete(bookmarks).run();
    expect(publish(attempt)).toBe(false);
    expect(failSummaryAttempt(db, attempt, "provider")).toBe(false);
    expect(db.select().from(summaryProcessing).all()).toEqual([]);
  });

  it("does not trust legacy or externally modified summaries", () => {
    expect(getPublishedReaderSummary(db, "link", "owner")).toBeNull();
    publish(begin());
    db.update(bookmarks).set({ summary: "Manually changed" }).run();
    expect(getPublishedReaderSummary(db, "link", "owner")).toBeNull();
  });

  it("rejects other owners and empty results", () => {
    expect(() => beginSummaryAttempt(db, "link", "other", "article")).toThrow();
    const attempt = begin();
    expect(() => publish(attempt, " \n")).toThrow("Empty summary");
    publish(attempt);
    expect(getPublishedReaderSummary(db, "link", "other")).toBeNull();
  });
});
