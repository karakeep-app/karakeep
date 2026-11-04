import { and, eq, inArray } from "drizzle-orm";

import { db, KarakeepDBTransaction } from "@karakeep/db";
import {
  assets,
  AssetTypes,
  bookmarkLinks,
  bookmarks,
} from "@karakeep/db/schema";

/** Checks inside the same write transaction that will save a missing page. */
export function hasSavedBookmarkCopyInTransaction(
  txn: KarakeepDBTransaction,
  bookmarkId: string,
): boolean {
  const link = txn
    .select({
      crawledAt: bookmarkLinks.crawledAt,
      htmlContent: bookmarkLinks.htmlContent,
      contentAssetId: bookmarkLinks.contentAssetId,
    })
    .from(bookmarkLinks)
    .where(eq(bookmarkLinks.id, bookmarkId))
    .get();
  if (!link) {
    throw new Error("The bookmark either doesn't exist or is not a link");
  }
  if (link.crawledAt || link.htmlContent || link.contentAssetId) return true;
  return Boolean(
    txn
      .select({ id: assets.id })
      .from(assets)
      .where(
        and(
          eq(assets.bookmarkId, bookmarkId),
          inArray(assets.assetType, [
            AssetTypes.LINK_SCREENSHOT,
            AssetTypes.LINK_PDF,
            AssetTypes.LINK_BANNER_IMAGE,
            AssetTypes.LINK_FULL_PAGE_ARCHIVE,
            AssetTypes.LINK_HTML_CONTENT,
          ]),
        ),
      )
      .get(),
  );
}

/** The check and all writes must share an immediate write transaction. */
export function persistCrawlInTransaction(
  txn: KarakeepDBTransaction,
  bookmarkId: string,
  isMissingPage: boolean,
  persist: () => void,
): boolean {
  if (isMissingPage && hasSavedBookmarkCopyInTransaction(txn, bookmarkId)) {
    return false;
  }
  persist();
  return true;
}

// Queue backends may serialize an error before delivering it to onError.
export class AssetDownloadHttpError extends Error {
  constructor(
    fileType: string,
    readonly statusCode: number,
  ) {
    super(`Failed to download ${fileType}: ${statusCode}`);
    this.name = `AssetDownloadHttpError:${statusCode}`;
  }
}

export function missingAssetStatusCode(error: Error): 404 | 410 | undefined {
  if (error.name === "AssetDownloadHttpError:404") return 404;
  if (error.name === "AssetDownloadHttpError:410") return 410;
  return undefined;
}

type DBAssetType = typeof assets.$inferInsert;
/** Replaces the current references, which may differ from a crawl's snapshot. */
export function replaceBookmarkAssets(
  txn: KarakeepDBTransaction,
  bookmarkId: string,
  assetType: DBAssetType["assetType"],
  newAsset?: DBAssetType,
): string[] {
  const existing = txn
    .select({ id: assets.id })
    .from(assets)
    .where(
      and(eq(assets.bookmarkId, bookmarkId), eq(assets.assetType, assetType)),
    )
    .all();
  for (const { id } of existing) {
    txn.delete(assets).where(eq(assets.id, id)).run();
  }
  if (newAsset) txn.insert(assets).values(newAsset).run();
  return existing.map(({ id }) => id);
}

/** Replaces an archive only if its crawl still owns the saved link content. */
export function replaceArchiveIfCurrent(
  txn: KarakeepDBTransaction,
  bookmarkId: string,
  crawlRevision: string,
  newAsset: DBAssetType,
): string[] | null {
  const current = txn
    .select({ id: bookmarkLinks.id })
    .from(bookmarkLinks)
    .where(
      and(
        eq(bookmarkLinks.id, bookmarkId),
        eq(bookmarkLinks.crawlRevision, crawlRevision),
      ),
    )
    .get();
  if (!current) return null;
  return replaceBookmarkAssets(
    txn,
    bookmarkId,
    AssetTypes.LINK_FULL_PAGE_ARCHIVE,
    newAsset,
  );
}

export function updateAsset(
  oldAssetId: string | undefined,
  newAsset: DBAssetType,
  txn: KarakeepDBTransaction,
) {
  if (oldAssetId) {
    txn.delete(assets).where(eq(assets.id, oldAssetId)).run();
  }

  txn.insert(assets).values(newAsset).run();
}

export async function getBookmarkDetails(bookmarkId: string) {
  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    with: {
      link: true,
      assets: true,
    },
  });

  if (!bookmark || !bookmark.link) {
    throw new Error("The bookmark either doesn't exist or is not a link");
  }
  return {
    url: bookmark.link.url,
    userId: bookmark.userId,
    createdAt: bookmark.createdAt,
    crawledAt: bookmark.link.crawledAt,
    htmlContent: bookmark.link.htmlContent,
    probeMetadataAt: bookmark.link.probeMetadataAt,
    screenshotAssetId: bookmark.assets.find(
      (a) => a.assetType == AssetTypes.LINK_SCREENSHOT,
    )?.id,
    pdfAssetId: bookmark.assets.find((a) => a.assetType == AssetTypes.LINK_PDF)
      ?.id,
    imageAssetId: bookmark.assets.find(
      (a) => a.assetType == AssetTypes.LINK_BANNER_IMAGE,
    )?.id,
    fullPageArchiveAssetId: bookmark.assets.find(
      (a) => a.assetType == AssetTypes.LINK_FULL_PAGE_ARCHIVE,
    )?.id,
    videoAssetId: bookmark.assets.find(
      (a) => a.assetType == AssetTypes.LINK_VIDEO,
    )?.id,
    precrawledArchiveAssetId: bookmark.assets
      .filter((a) => a.assetType == AssetTypes.LINK_PRECRAWLED_ARCHIVE)
      .at(-1)?.id,
    contentAssetId: bookmark.assets.find(
      (a) => a.assetType == AssetTypes.LINK_HTML_CONTENT,
    )?.id,
  };
}

export async function recordCrawlFailure(
  bookmarkId: string,
  statusCode?: number,
  requireSavedCopy = false,
) {
  await db.transaction(
    (tx) => {
      const exists = tx
        .select({ id: bookmarkLinks.id })
        .from(bookmarkLinks)
        .where(eq(bookmarkLinks.id, bookmarkId))
        .get();
      if (!exists) return;
      const preserved =
        statusCode !== undefined &&
        (!requireSavedCopy ||
          hasSavedBookmarkCopyInTransaction(tx, bookmarkId));
      tx.update(bookmarkLinks)
        .set({
          crawlStatus: "failure",
          ...(preserved ? { crawlStatusCode: statusCode } : {}),
        })
        .where(eq(bookmarkLinks.id, bookmarkId))
        .run();
      // A recrawl that preserved a copy did not create inference jobs or set
      // their statuses. Pending statuses may belong to another running job.
      if (preserved) return;
      tx.update(bookmarks)
        .set({ taggingStatus: null })
        .where(
          and(
            eq(bookmarks.id, bookmarkId),
            eq(bookmarks.taggingStatus, "pending"),
          ),
        )
        .run();
      tx.update(bookmarks)
        .set({ summarizationStatus: null })
        .where(
          and(
            eq(bookmarks.id, bookmarkId),
            eq(bookmarks.summarizationStatus, "pending"),
          ),
        )
        .run();
      tx.update(bookmarks)
        .set({ embeddingStatus: null })
        .where(
          and(
            eq(bookmarks.id, bookmarkId),
            eq(bookmarks.embeddingStatus, "pending"),
          ),
        )
        .run();
    },
    { behavior: "immediate" },
  );
}
