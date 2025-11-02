import { and, asc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";

import type { ZAdminMaintenanceMigrateLargeLinkHtmlTask } from "@karakeep/shared-server";
import type { DequeuedJob } from "@karakeep/shared/queueing";
import { db } from "@karakeep/db";
import { AssetTypes, bookmarkLinks, bookmarks } from "@karakeep/db/schema";
import { QuotaService } from "@karakeep/shared-server";
import {
  ASSET_TYPES,
  deleteAsset,
  newAssetId,
  saveAsset,
} from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { tryCatch } from "@karakeep/shared/tryCatch";

import { updateAsset } from "../../../workerUtils";

const BATCH_SIZE = 25;

interface BookmarkHtmlRow {
  bookmarkId: string;
  userId: string;
  htmlContent: string;
}

async function getBookmarksWithLargeInlineHtml(limit: number, cursor?: string) {
  const rows = await db
    .select({
      bookmarkId: bookmarkLinks.id,
      userId: bookmarks.userId,
      htmlContent: bookmarkLinks.htmlContent,
    })
    .from(bookmarkLinks)
    .innerJoin(bookmarks, eq(bookmarkLinks.id, bookmarks.id))
    .where(
      cursor
        ? and(
            gt(bookmarkLinks.id, cursor),
            isNotNull(bookmarkLinks.htmlContent),
            isNull(bookmarkLinks.contentAssetId),
            sql`length(CAST(${bookmarkLinks.htmlContent} AS BLOB)) > ${serverConfig.crawler.htmlContentSizeThreshold}`,
          )
        : and(
            isNotNull(bookmarkLinks.htmlContent),
            isNull(bookmarkLinks.contentAssetId),
            sql`length(CAST(${bookmarkLinks.htmlContent} AS BLOB)) > ${serverConfig.crawler.htmlContentSizeThreshold}`,
          ),
    )
    .orderBy(asc(bookmarkLinks.id))
    .limit(limit);

  return rows.filter((row): row is BookmarkHtmlRow => row.htmlContent !== null);
}

async function migrateBookmarkHtml(
  bookmark: BookmarkHtmlRow,
  jobId: string,
): Promise<boolean> {
  const { bookmarkId, userId, htmlContent } = bookmark;

  const contentSize = Buffer.byteLength(htmlContent, "utf8");

  if (contentSize <= serverConfig.crawler.htmlContentSizeThreshold) {
    logger.debug(
      `[adminMaintenance:migrate_large_link_html][${jobId}] Bookmark ${bookmarkId} inline HTML (${contentSize} bytes) below threshold, skipping`,
    );
    return false;
  }

  const { data: quotaApproved, error: quotaError } = await tryCatch(
    QuotaService.checkStorageQuota(db, userId, contentSize),
  );

  if (quotaError || !quotaApproved) {
    logger.warn(
      `[adminMaintenance:migrate_large_link_html][${jobId}] Skipping bookmark ${bookmarkId} due to storage quota error: ${quotaError?.message}`,
    );
    return false;
  }

  const contentBuffer = Buffer.from(htmlContent, "utf8");
  const assetId = newAssetId();
  const { error: saveError } = await tryCatch(
    saveAsset({
      userId,
      assetId,
      asset: contentBuffer,
      metadata: { contentType: ASSET_TYPES.TEXT_HTML, fileName: null },
      quotaApproved,
    }),
  );

  if (saveError) {
    logger.error(
      `[adminMaintenance:migrate_large_link_html][${jobId}] Failed to persist HTML for bookmark ${bookmarkId} as asset: ${saveError}`,
    );
    await deleteAsset({ userId, assetId }).catch(() => {
      /* ignore */
    });
    return false;
  }

  try {
    await db.transaction(async (txn) => {
      const res = await txn
        .update(bookmarkLinks)
        .set({ htmlContent: null, contentAssetId: assetId })
        .where(
          and(
            eq(bookmarkLinks.id, bookmarkId),
            isNull(bookmarkLinks.contentAssetId),
          ),
        );

      if (res.changes === 0) {
        throw new Error("Failed to update bookmark");
      }

      await updateAsset(
        undefined,
        {
          id: assetId,
          bookmarkId,
          userId,
          assetType: AssetTypes.LINK_HTML_CONTENT,
          contentType: ASSET_TYPES.TEXT_HTML,
          size: contentSize,
          fileName: null,
        },
        txn,
      );
    });
  } catch (error) {
    await deleteAsset({ userId, assetId }).catch(() => {
      /* ignore */
    });
    logger.error(
      `[adminMaintenance:migrate_large_link_html][${jobId}] Failed to update bookmark ${bookmarkId} after storing asset: ${error}`,
    );
    return false;
  }

  logger.info(
    `[adminMaintenance:migrate_large_link_html][${jobId}] Migrated inline HTML (${contentSize} bytes) for bookmark ${bookmarkId} to asset ${assetId}`,
  );

  return true;
}

export async function runMigrateLargeLinkHtmlTask(
  job: DequeuedJob<ZAdminMaintenanceMigrateLargeLinkHtmlTask>,
): Promise<void> {
  const jobId = job.id;
  let migratedCount = 0;
  let cursor: string | undefined;

  while (true) {
    if (job.abortSignal.aborted) {
      logger.warn(
        `[adminMaintenance:migrate_large_link_html][${jobId}] Aborted`,
      );
      break;
    }
    const bookmarksToMigrate = await getBookmarksWithLargeInlineHtml(
      BATCH_SIZE,
      cursor,
    );

    if (bookmarksToMigrate.length === 0) {
      break;
    }

    for (const bookmark of bookmarksToMigrate) {
      try {
        const migrated = await migrateBookmarkHtml(bookmark, jobId);
        if (migrated) {
          migratedCount += 1;
        }
      } catch (error) {
        logger.error(
          `[adminMaintenance:migrate_large_link_html][${jobId}] Unexpected error migrating bookmark ${bookmark.bookmarkId}: ${error}`,
        );
      }
    }

    cursor = bookmarksToMigrate[bookmarksToMigrate.length - 1]?.bookmarkId;
  }

  logger.info(
    `[adminMaintenance:migrate_large_link_html][${jobId}] Completed migration. Total bookmarks migrated: ${migratedCount}`,
  );
}
