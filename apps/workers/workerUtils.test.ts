import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import {
  assets,
  AssetTypes,
  bookmarkLinks,
  bookmarks,
  users,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

const mocks = await vi.hoisted(async () => {
  const { getInMemoryDB } = await import("@karakeep/db/drizzle");
  return { db: getInMemoryDB(true) };
});
vi.mock("@karakeep/db", async (original) => ({
  ...(await original<typeof import("@karakeep/db")>()),
  db: mocks.db,
}));

import {
  AssetDownloadHttpError,
  hasSavedBookmarkCopyInTransaction,
  metadataForCrawlCommit,
  missingAssetStatusCode,
  persistCrawlInTransaction,
  recordCrawlFailure,
  replaceArchiveIfCurrent,
  replaceBookmarkAssets,
} from "./workerUtils";

const db = mocks.db;

async function createLink() {
  const [user] = await db
    .insert(users)
    .values({ name: "Test", email: `${crypto.randomUUID()}@test.com` })
    .returning();
  const [bookmark] = await db
    .insert(bookmarks)
    .values({ userId: user.id, type: BookmarkTypes.LINK })
    .returning();
  await db
    .insert(bookmarkLinks)
    .values({ id: bookmark.id, url: "https://example.com" });
  return { userId: user.id, bookmarkId: bookmark.id };
}

describe("full-page archive revisions", () => {
  it("keeps the newer archive when an older crawl finishes archiving last", async () => {
    const { userId, bookmarkId } = await createLink();
    const archive = (id: string) => ({
      id,
      bookmarkId,
      userId,
      assetType: AssetTypes.LINK_FULL_PAGE_ARCHIVE,
    });
    const sameSecond = new Date("2026-01-01T12:00:00Z");
    await db.insert(assets).values(archive("previous-archive"));
    await db
      .update(bookmarkLinks)
      .set({
        crawledAt: sameSecond,
        htmlContent: "same content",
        crawlRevision: "crawl-a",
      })
      .where(eq(bookmarkLinks.id, bookmarkId));
    // A starts archiving. B commits an indistinguishable page in the same second.
    await db
      .update(bookmarkLinks)
      .set({
        crawledAt: sameSecond,
        htmlContent: "same content",
        crawlRevision: "crawl-b",
      })
      .where(eq(bookmarkLinks.id, bookmarkId));
    expect(
      db.transaction((tx) =>
        replaceArchiveIfCurrent(
          tx,
          bookmarkId,
          "crawl-b",
          archive("archive-b"),
        ),
      ),
    ).toEqual(["previous-archive"]);
    expect(
      db.transaction((tx) =>
        replaceArchiveIfCurrent(
          tx,
          bookmarkId,
          "crawl-a",
          archive("archive-a"),
        ),
      ),
    ).toBeNull();
    expect(
      db.select().from(assets).where(eq(assets.bookmarkId, bookmarkId)).all(),
    ).toMatchObject([{ id: "archive-b" }]);
  });

  it("rejects an archive after the link is deleted", async () => {
    const { userId, bookmarkId } = await createLink();
    await db.delete(bookmarks).where(eq(bookmarks.id, bookmarkId));
    expect(
      db.transaction((tx) =>
        replaceArchiveIfCurrent(tx, bookmarkId, "crawl-a", {
          id: "archive-a",
          bookmarkId,
          userId,
          assetType: AssetTypes.LINK_FULL_PAGE_ARCHIVE,
        }),
      ),
    ).toBeNull();
  });
});

describe("missing-page crawl persistence", () => {
  it.each([404, 410])(
    "keeps an overlapping good preview and user edits after HTTP %i",
    async (status) => {
      const { bookmarkId } = await createLink();
      await db
        .update(bookmarkLinks)
        .set({
          title: "Good title",
          description: "Good description",
          crawlStatusCode: 200,
          hasCrawlMetadata: true,
        })
        .where(eq(bookmarkLinks.id, bookmarkId));
      db.transaction(
        (tx) => {
          tx.update(bookmarkLinks)
            .set({
              ...metadataForCrawlCommit(tx, bookmarkId, true, {
                title: "Missing",
                description: "Error",
                crawlStatusCode: status,
              }),
              htmlContent: "error content",
              crawledAt: new Date(),
            })
            .where(eq(bookmarkLinks.id, bookmarkId))
            .run();
        },
        { behavior: "immediate" },
      );
      await db
        .update(bookmarkLinks)
        .set({ description: "User edit" })
        .where(eq(bookmarkLinks.id, bookmarkId));
      db.transaction(
        (tx) => {
          tx.update(bookmarkLinks)
            .set({
              ...metadataForCrawlCommit(tx, bookmarkId, false, {
                title: "Good title",
                description: "Good description",
                crawlStatusCode: 200,
              }),
              htmlContent: "good content",
            })
            .where(eq(bookmarkLinks.id, bookmarkId))
            .run();
        },
        { behavior: "immediate" },
      );
      expect(
        db
          .select()
          .from(bookmarkLinks)
          .where(eq(bookmarkLinks.id, bookmarkId))
          .get(),
      ).toMatchObject({
        title: "Good title",
        description: "User edit",
        crawlStatusCode: 200,
        htmlContent: "good content",
      });
    },
  );

  it("still saves metadata for an initial missing page", async () => {
    const { bookmarkId } = await createLink();
    db.transaction(
      (tx) => {
        tx.update(bookmarkLinks)
          .set(
            metadataForCrawlCommit(tx, bookmarkId, true, {
              title: "Missing",
              crawlStatusCode: 404,
            }),
          )
          .where(eq(bookmarkLinks.id, bookmarkId))
          .run();
      },
      { behavior: "immediate" },
    );
    expect(
      db
        .select()
        .from(bookmarkLinks)
        .where(eq(bookmarkLinks.id, bookmarkId))
        .get(),
    ).toMatchObject({ title: "Missing", crawlStatusCode: 404 });
  });
  it.each([
    AssetTypes.LINK_SCREENSHOT,
    AssetTypes.LINK_PDF,
    AssetTypes.LINK_BANNER_IMAGE,
    AssetTypes.LINK_FULL_PAGE_ARCHIVE,
    AssetTypes.LINK_HTML_CONTENT,
  ])("detects an existing %s inside the transaction", async (assetType) => {
    const { userId, bookmarkId } = await createLink();
    expect(
      db.transaction((tx) => hasSavedBookmarkCopyInTransaction(tx, bookmarkId)),
    ).toBe(false);
    await db
      .insert(assets)
      .values({ id: crypto.randomUUID(), userId, bookmarkId, assetType });
    expect(
      db.transaction((tx) => hasSavedBookmarkCopyInTransaction(tx, bookmarkId)),
    ).toBe(true);
  });

  it("does not write an error page when a copy is saved after an earlier check", async () => {
    const { userId, bookmarkId } = await createLink();
    expect(
      db.transaction((tx) => hasSavedBookmarkCopyInTransaction(tx, bookmarkId)),
    ).toBe(false);
    db.transaction((tx) => {
      tx.update(bookmarkLinks)
        .set({
          title: "Good",
          htmlContent: "good content",
          crawledAt: new Date(),
        })
        .where(eq(bookmarkLinks.id, bookmarkId))
        .run();
      tx.insert(assets)
        .values({
          id: "good-screenshot",
          bookmarkId,
          userId,
          assetType: AssetTypes.LINK_SCREENSHOT,
        })
        .run();
    });
    const write = vi.fn();
    const saved = db.transaction(
      (tx) => persistCrawlInTransaction(tx, bookmarkId, true, write),
      { behavior: "immediate" },
    );
    expect(saved).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(
      db
        .select()
        .from(bookmarkLinks)
        .where(eq(bookmarkLinks.id, bookmarkId))
        .get(),
    ).toMatchObject({ title: "Good", htmlContent: "good content" });
    expect(
      db
        .select()
        .from(assets)
        .where(eq(assets.bookmarkId, bookmarkId))
        .all()
        .map((asset) => asset.id),
    ).toEqual(["good-screenshot"]);
  });

  it("replaces assets saved by an earlier missing-page crawl", async () => {
    const { userId, bookmarkId } = await createLink();
    db.transaction(
      (tx) => {
        expect(
          persistCrawlInTransaction(tx, bookmarkId, true, () => {
            tx.update(bookmarkLinks)
              .set({
                title: "Missing",
                htmlContent: "error",
                crawledAt: new Date(),
              })
              .where(eq(bookmarkLinks.id, bookmarkId))
              .run();
            tx.insert(assets)
              .values({
                id: "error-screenshot",
                bookmarkId,
                userId,
                assetType: AssetTypes.LINK_SCREENSHOT,
              })
              .run();
            tx.insert(assets)
              .values({
                id: "error-archive",
                bookmarkId,
                userId,
                assetType: AssetTypes.LINK_FULL_PAGE_ARCHIVE,
              })
              .run();
          }),
        ).toBe(true);
      },
      { behavior: "immediate" },
    );
    const deleted = db.transaction(
      (tx) => {
        tx.update(bookmarkLinks)
          .set({ title: "Good", htmlContent: "good" })
          .where(eq(bookmarkLinks.id, bookmarkId))
          .run();
        return [
          ...replaceBookmarkAssets(tx, bookmarkId, AssetTypes.LINK_SCREENSHOT, {
            id: "good-screenshot-2",
            bookmarkId,
            userId,
            assetType: AssetTypes.LINK_SCREENSHOT,
          }),
          ...replaceBookmarkAssets(
            tx,
            bookmarkId,
            AssetTypes.LINK_FULL_PAGE_ARCHIVE,
            {
              id: "good-archive",
              bookmarkId,
              userId,
              assetType: AssetTypes.LINK_FULL_PAGE_ARCHIVE,
            },
          ),
        ];
      },
      { behavior: "immediate" },
    );
    expect(deleted.sort()).toEqual(["error-archive", "error-screenshot"]);
    expect(
      db
        .select()
        .from(bookmarkLinks)
        .where(eq(bookmarkLinks.id, bookmarkId))
        .get(),
    ).toMatchObject({ title: "Good", htmlContent: "good" });
    expect(
      db
        .select()
        .from(assets)
        .where(eq(assets.bookmarkId, bookmarkId))
        .all()
        .map((asset) => asset.id)
        .sort(),
    ).toEqual(["good-archive", "good-screenshot-2"]);
  });

  it("does not clear another task's pending statuses when a copy is preserved", async () => {
    const { bookmarkId } = await createLink();
    await recordCrawlFailure(bookmarkId, 410);
    expect(
      db.select().from(bookmarks).where(eq(bookmarks.id, bookmarkId)).get(),
    ).toMatchObject({
      taggingStatus: "pending",
      summarizationStatus: "pending",
      embeddingStatus: "pending",
    });
    expect(
      db
        .select()
        .from(bookmarkLinks)
        .where(eq(bookmarkLinks.id, bookmarkId))
        .get(),
    ).toMatchObject({ crawlStatus: "failure", crawlStatusCode: 410 });
    await db
      .update(bookmarks)
      .set({
        taggingStatus: "success",
        summarizationStatus: "success",
        embeddingStatus: "success",
      })
      .where(eq(bookmarks.id, bookmarkId));
    expect(
      db.select().from(bookmarks).where(eq(bookmarks.id, bookmarkId)).get(),
    ).toMatchObject({
      taggingStatus: "success",
      summarizationStatus: "success",
      embeddingStatus: "success",
    });
  });

  it("still clears pending statuses after a permanent initial crawl failure", async () => {
    const { bookmarkId } = await createLink();
    await recordCrawlFailure(bookmarkId);
    expect(
      db.select().from(bookmarks).where(eq(bookmarks.id, bookmarkId)).get(),
    ).toMatchObject({
      taggingStatus: null,
      summarizationStatus: null,
      embeddingStatus: null,
    });
  });

  it.each([404, 410])(
    "records HTTP %i when a copy appears before the asset failure callback",
    async (status) => {
      const { bookmarkId } = await createLink();
      expect(
        db.transaction((tx) =>
          hasSavedBookmarkCopyInTransaction(tx, bookmarkId),
        ),
      ).toBe(false);
      await db
        .update(bookmarkLinks)
        .set({ htmlContent: "saved", crawledAt: new Date() })
        .where(eq(bookmarkLinks.id, bookmarkId));
      const error = new AssetDownloadHttpError("pdf", status);
      // Restate reconstructs errors from name/message rather than the class.
      const reconstructed = Object.assign(new Error(error.message), {
        name: error.name,
      });
      await recordCrawlFailure(
        bookmarkId,
        missingAssetStatusCode(reconstructed),
        true,
      );
      expect(
        db
          .select()
          .from(bookmarkLinks)
          .where(eq(bookmarkLinks.id, bookmarkId))
          .get(),
      ).toMatchObject({
        htmlContent: "saved",
        crawlStatus: "failure",
        crawlStatusCode: status,
      });
      expect(
        db.select().from(bookmarks).where(eq(bookmarks.id, bookmarkId)).get(),
      ).toMatchObject({
        taggingStatus: "pending",
        summarizationStatus: "pending",
        embeddingStatus: "pending",
      });
    },
  );

  it("keeps initial asset-download failure behavior if no copy was saved", async () => {
    const { bookmarkId } = await createLink();
    await recordCrawlFailure(bookmarkId, 404, true);
    expect(
      db
        .select()
        .from(bookmarkLinks)
        .where(eq(bookmarkLinks.id, bookmarkId))
        .get(),
    ).toMatchObject({ crawlStatus: "failure", crawlStatusCode: 200 });
    expect(
      db.select().from(bookmarks).where(eq(bookmarks.id, bookmarkId)).get(),
    ).toMatchObject({
      taggingStatus: null,
      summarizationStatus: null,
      embeddingStatus: null,
    });
  });
});
