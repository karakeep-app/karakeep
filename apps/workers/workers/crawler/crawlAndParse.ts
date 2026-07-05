// Orchestrates a single bookmark crawl: fetches the page (browser render or
// precrawled archive), parses it, merges the probe/render metadata, and
// persists the results (metadata first for fast feedback, then contents and
// assets). Also handles URLs that turn out to be plain assets (pdf/image) by
// converting the link bookmark into an asset bookmark.
import * as path from "node:path";
import { eq } from "drizzle-orm";
import { crawlerStatusCodeCounter } from "metrics";
import { getBookmarkDomain } from "network";
import type { RunProxyConfig } from "network";
import { abortRace, raceWith } from "utils";
import { updateAsset } from "workerUtils";

import { db } from "@karakeep/db";
import {
  assets,
  AssetTypes,
  bookmarkAssets,
  bookmarkLinks,
  bookmarks,
} from "@karakeep/db/schema";
import {
  addLogFields,
  AssetPreprocessingQueue,
  getTracer,
  setSpanAttributes,
  withSpan,
} from "@karakeep/shared-server";
import {
  ASSET_TYPES,
  readAsset,
  silentDeleteAsset,
} from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { ParseSubprocessOutput } from "../utils/parseHtmlSubprocessIpc";
import {
  isLikelyChallengePage,
  resolveMetadata,
} from "../utils/metadataResolver";
import {
  archiveWebpage,
  downloadAndStoreFile,
  downloadAndStoreImage,
  storeHtmlContent,
  storePdf,
  storeScreenshot,
} from "./assetStorage";
import { crawlPage } from "./crawlPage";
import { runParseSubprocess } from "./parseSubprocess";
import { redactUrlCredentials, shouldRetryCrawlStatusCode } from "./utils";

const tracer = getTracer("@karakeep/workers");

type DBAssetType = typeof assets.$inferInsert;

/**
 * Downloads the asset from the URL and transforms the linkBookmark to an assetBookmark
 * @param url the url the user provided
 * @param assetType the type of the asset we're downloading
 * @param userId the id of the user
 * @param jobId the id of the job for logging
 * @param bookmarkId the id of the bookmark
 */
export async function handleAsAssetBookmark(
  url: string,
  assetType: "image" | "pdf",
  userId: string,
  jobId: string,
  bookmarkId: string,
  abortSignal: AbortSignal,
  runProxy: RunProxyConfig,
) {
  return await withSpan(
    tracer,
    "crawlerWorker.handleAsAssetBookmark",
    {
      attributes: {
        "bookmark.url": url,
        "bookmark.domain": getBookmarkDomain(url),
        "job.id": jobId,
        "user.id": userId,
        "bookmark.id": bookmarkId,
        "asset.type": assetType,
      },
    },
    async () => {
      const downloaded = await downloadAndStoreFile(
        url,
        userId,
        jobId,
        assetType,
        abortSignal,
        runProxy,
      );
      if (!downloaded) {
        return;
      }
      const fileName = path.basename(new URL(url).pathname);
      await db.transaction(async (trx) => {
        await updateAsset(
          undefined,
          {
            id: downloaded.assetId,
            bookmarkId,
            userId,
            assetType: AssetTypes.BOOKMARK_ASSET,
            contentType: downloaded.contentType,
            size: downloaded.size,
            fileName,
          },
          trx,
        );
        await trx.insert(bookmarkAssets).values({
          id: bookmarkId,
          assetType,
          assetId: downloaded.assetId,
          content: null,
          fileName,
          sourceUrl: url,
        });
        // Switch the type of the bookmark from LINK to ASSET
        await trx
          .update(bookmarks)
          .set({ type: BookmarkTypes.ASSET })
          .where(eq(bookmarks.id, bookmarkId));
        await trx.delete(bookmarkLinks).where(eq(bookmarkLinks.id, bookmarkId));
      });
      await AssetPreprocessingQueue.enqueue(
        {
          bookmarkId,
          fixMode: false,
        },
        {
          groupId: userId,
        },
      );
    },
  );
}

export interface CrawlAndParseUrlArgs {
  url: string;
  userId: string;
  jobId: string;
  bookmarkId: string;
  /** Asset ids from a previous crawl of this bookmark, replaced (and deleted) on success. */
  oldAssets: {
    screenshotAssetId: string | undefined;
    pdfAssetId: string | undefined;
    imageAssetId: string | undefined;
    fullPageArchiveAssetId: string | undefined;
    contentAssetId: string | undefined;
  };
  precrawledArchiveAssetId: string | undefined;
  archiveFullPage: boolean;
  forceStorePdf: boolean;
  numRetriesLeft: number;
  abortSignal: AbortSignal;
  runProxy: RunProxyConfig;
  probeMetadataPromise: Promise<ParseSubprocessOutput["metadata"] | null>;
}

/**
 * Crawls the url, parses it, and persists the bookmark's metadata, content,
 * and assets. Returns a closure that runs the (failure-prone) full-page
 * archival, so the caller can defer it to the very end of the job.
 */
export async function crawlAndParseUrl(
  args: CrawlAndParseUrlArgs,
): Promise<() => Promise<void>> {
  const {
    url,
    userId,
    jobId,
    bookmarkId,
    oldAssets,
    precrawledArchiveAssetId,
    archiveFullPage,
    forceStorePdf,
    numRetriesLeft,
    abortSignal,
    runProxy,
    probeMetadataPromise,
  } = args;
  const sanitizedProxyUrl = redactUrlCredentials(
    runProxy.httpsProxy ?? runProxy.httpProxy ?? "",
  );

  return await withSpan(
    tracer,
    "crawlerWorker.crawlAndParseUrl",
    {
      attributes: {
        "bookmark.url": url,
        "bookmark.domain": getBookmarkDomain(url),
        "job.id": jobId,
        "user.id": userId,
        "bookmark.id": bookmarkId,
        "crawler.archiveFullPage": archiveFullPage,
        "crawler.forceStorePdf": forceStorePdf,
        "crawler.hasPrecrawledArchive": !!precrawledArchiveAssetId,
        "crawler.proxy": sanitizedProxyUrl,
      },
    },
    async () => {
      let result: {
        htmlContent: string;
        screenshot: Buffer | undefined;
        pdf: Buffer | undefined;
        statusCode: number | null;
        url: string;
      };

      if (precrawledArchiveAssetId) {
        logger.info(
          `[Crawler][${jobId}] The page has been precrawled. Will use the precrawled archive instead.`,
        );
        const asset = await readAsset({
          userId,
          assetId: precrawledArchiveAssetId,
        });
        result = {
          htmlContent: asset.asset.toString(),
          screenshot: undefined,
          pdf: undefined,
          statusCode: 200,
          url,
        };
      } else {
        result = await crawlPage(
          jobId,
          url,
          userId,
          forceStorePdf,
          abortSignal,
          runProxy,
        );
      }
      abortSignal.throwIfAborted();

      const {
        htmlContent,
        screenshot,
        pdf,
        statusCode,
        url: browserUrl,
      } = result;

      // Track status code in Prometheus
      if (statusCode !== null) {
        crawlerStatusCodeCounter
          .labels(statusCode.toString(), sanitizedProxyUrl)
          .inc();
        setSpanAttributes({
          "crawler.statusCode": statusCode,
        });
      }
      addLogFields<"crawlerWorker.run">({
        "crawler.status_code": statusCode,
      });

      if (shouldRetryCrawlStatusCode(statusCode)) {
        if (numRetriesLeft > 0) {
          throw new Error(
            `[Crawler][${jobId}] Received status code ${statusCode}. Will retry crawl. Retries left: ${numRetriesLeft}`,
          );
        }
        logger.info(
          `[Crawler][${jobId}] Received status code ${statusCode} on latest retry attempt. Proceeding without retry.`,
        );
      }

      const { metadata: renderMeta, readableContent: parsedReadableContent } =
        await runParseSubprocess(htmlContent, browserUrl, jobId, abortSignal);
      abortSignal.throwIfAborted();

      // The probe metadata extraction has been running alongside the crawl;
      // this is the point where it's needed. The promise never rejects and
      // all its underlying work is time-bounded.
      const probeMetadata = await probeMetadataPromise;
      abortSignal.throwIfAborted();

      // On the last retry attempt the crawl proceeds despite a blocked status
      // code, and some bot walls serve their challenge page with a 200; in
      // both cases don't let that page's metadata override clean values from
      // the preflight probe.
      const renderBlocked =
        shouldRetryCrawlStatusCode(statusCode) ||
        isLikelyChallengePage({ title: renderMeta.title, htmlContent });
      addLogFields<"crawlerWorker.run">({
        "crawler.render_blocked": renderBlocked,
      });
      if (renderBlocked && probeMetadata) {
        logger.info(
          `[Crawler][${jobId}] The rendered page looks blocked (status ${statusCode}); preferring preflight probe metadata.`,
        );
      }
      const meta = resolveMetadata(renderMeta, probeMetadata, renderBlocked);

      const parseDate = (date: string | null | undefined) => {
        if (!date) {
          return null;
        }
        try {
          return new Date(date);
        } catch {
          return null;
        }
      };

      // Phase 1: Write metadata immediately for fast user feedback.
      // Content and asset storage happen later and can be slow (banner
      // image download, screenshot/pdf upload, etc.).
      await db
        .update(bookmarkLinks)
        .set({
          title: meta.title,
          description: meta.description,
          // Don't store data URIs as they're not valid URLs and are usually quite large
          imageUrl: meta.image?.startsWith("data:") ? null : meta.image,
          favicon: meta.logo,
          crawlStatusCode: statusCode,
          author: meta.author,
          publisher: meta.publisher,
          datePublished: parseDate(meta.datePublished),
          dateModified: parseDate(meta.dateModified),
        })
        .where(eq(bookmarkLinks.id, bookmarkId));

      let readableContent = parsedReadableContent;

      const screenshotAssetInfo = await raceWith(
        storeScreenshot(screenshot, userId, jobId),
        abortRace(abortSignal),
      );
      abortSignal.throwIfAborted();

      const pdfAssetInfo = await raceWith(
        storePdf(pdf, userId, jobId),
        abortRace(abortSignal),
      );
      abortSignal.throwIfAborted();

      const htmlContentAssetInfo = await storeHtmlContent(
        readableContent?.content,
        userId,
        jobId,
      );
      abortSignal.throwIfAborted();
      let imageAssetInfo: DBAssetType | null = null;
      if (meta.image) {
        const downloaded = await downloadAndStoreImage(
          meta.image,
          userId,
          jobId,
          abortSignal,
          runProxy,
        );
        if (downloaded) {
          imageAssetInfo = {
            id: downloaded.assetId,
            bookmarkId,
            userId,
            assetType: AssetTypes.LINK_BANNER_IMAGE,
            contentType: downloaded.contentType,
            size: downloaded.size,
          };
        }
      }
      abortSignal.throwIfAborted();

      // Phase 2: Write content and asset references.
      // TODO(important): Restrict the size of content to store
      const assetDeletionTasks: Promise<void>[] = [];
      const inlineHtmlContent =
        htmlContentAssetInfo.result === "store_inline"
          ? (readableContent?.content ?? null)
          : null;
      readableContent = null;
      await db.transaction(async (txn) => {
        await txn
          .update(bookmarkLinks)
          .set({
            crawledAt: new Date(),
            htmlContent: inlineHtmlContent,
            contentAssetId:
              htmlContentAssetInfo.result === "stored"
                ? htmlContentAssetInfo.assetId
                : null,
          })
          .where(eq(bookmarkLinks.id, bookmarkId));

        if (screenshotAssetInfo) {
          await updateAsset(
            oldAssets.screenshotAssetId,
            {
              id: screenshotAssetInfo.assetId,
              bookmarkId,
              userId,
              assetType: AssetTypes.LINK_SCREENSHOT,
              contentType: screenshotAssetInfo.contentType,
              size: screenshotAssetInfo.size,
              fileName: screenshotAssetInfo.fileName,
            },
            txn,
          );
          assetDeletionTasks.push(
            silentDeleteAsset(userId, oldAssets.screenshotAssetId),
          );
        }
        if (pdfAssetInfo) {
          await updateAsset(
            oldAssets.pdfAssetId,
            {
              id: pdfAssetInfo.assetId,
              bookmarkId,
              userId,
              assetType: AssetTypes.LINK_PDF,
              contentType: pdfAssetInfo.contentType,
              size: pdfAssetInfo.size,
              fileName: pdfAssetInfo.fileName,
            },
            txn,
          );
          assetDeletionTasks.push(
            silentDeleteAsset(userId, oldAssets.pdfAssetId),
          );
        }
        if (imageAssetInfo) {
          await updateAsset(oldAssets.imageAssetId, imageAssetInfo, txn);
          assetDeletionTasks.push(
            silentDeleteAsset(userId, oldAssets.imageAssetId),
          );
        }
        if (htmlContentAssetInfo.result === "stored") {
          await updateAsset(
            oldAssets.contentAssetId,
            {
              id: htmlContentAssetInfo.assetId,
              bookmarkId,
              userId,
              assetType: AssetTypes.LINK_HTML_CONTENT,
              contentType: ASSET_TYPES.TEXT_HTML,
              size: htmlContentAssetInfo.size,
              fileName: null,
            },
            txn,
          );
          assetDeletionTasks.push(
            silentDeleteAsset(userId, oldAssets.contentAssetId),
          );
        } else if (oldAssets.contentAssetId) {
          // Unlink the old content asset
          await txn
            .delete(assets)
            .where(eq(assets.id, oldAssets.contentAssetId));
          assetDeletionTasks.push(
            silentDeleteAsset(userId, oldAssets.contentAssetId),
          );
        }
      });

      // Delete the old assets if any
      await Promise.all(assetDeletionTasks);

      return async () => {
        if (
          !precrawledArchiveAssetId &&
          (serverConfig.crawler.fullPageArchive || archiveFullPage)
        ) {
          const archiveResult = await archiveWebpage(
            htmlContent,
            browserUrl,
            userId,
            jobId,
            abortSignal,
            runProxy,
          );

          if (archiveResult) {
            const {
              assetId: fullPageArchiveAssetId,
              size,
              contentType,
            } = archiveResult;

            await db.transaction(async (txn) => {
              await updateAsset(
                oldAssets.fullPageArchiveAssetId,
                {
                  id: fullPageArchiveAssetId,
                  bookmarkId,
                  userId,
                  assetType: AssetTypes.LINK_FULL_PAGE_ARCHIVE,
                  contentType,
                  size,
                  fileName: null,
                },
                txn,
              );
            });
            if (oldAssets.fullPageArchiveAssetId) {
              await silentDeleteAsset(userId, oldAssets.fullPageArchiveAssetId);
            }
          }
        }
      };
    },
  );
}
