import { promises as fs } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getProxyAgent, selectRunProxies } from "network";
import { withWorkerEventLog, withWorkerTracing } from "workerTracing";
import { updateAsset } from "workerUtils";

import type { ZYouTubeTranscriptRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import {
  assets,
  AssetTypes,
  bookmarkLinks,
  bookmarks,
} from "@karakeep/db/schema";
import {
  addLogFields,
  triggerSearchReindex,
  YouTubeTranscriptQueue,
} from "@karakeep/shared-server";
import {
  ASSET_TYPES,
  readAsset,
  silentDeleteAsset,
} from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import {
  DequeuedJob,
  DequeuedJobError,
  getQueueClient,
  QueueRetryAfterError,
} from "@karakeep/shared/queueing";

import { storeHtmlContent } from "./crawler/assetStorage";
import {
  fetchYouTubeTranscript,
  isYouTubeUrl,
  transcriptToHtml,
  TranslatedCaptionRateLimitError,
} from "./crawler/youtubeTranscript";

const RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;
const CRAWL_WAIT_RETRY_MS = 15 * 1000;
const TRANSCRIPT_REQUEST_INTERVAL_MS = 15 * 1000;
const RATE_LIMIT_STATE_FILE = path.join(
  serverConfig.dataDir,
  "youtube-transcript-rate-limit-until",
);
let youtubeRateLimitUntil = 0;
let nextTranscriptRequestAt = 0;

export class YouTubeTranscriptWorker {
  static async build() {
    logger.info("Starting YouTube transcript worker ...");

    return (await getQueueClient())!.createRunner<ZYouTubeTranscriptRequest>(
      YouTubeTranscriptQueue,
      {
        run: withWorkerTracing(
          "youtubeTranscriptWorker.run",
          withWorkerEventLog("youtubeTranscriptWorker.run", runWorker),
        ),
        onComplete: async (job) => {
          logger.info(
            `[YouTubeTranscript][${job.id}] Transcript job completed successfully`,
          );
        },
        onError: async (job: DequeuedJobError<ZYouTubeTranscriptRequest>) => {
          const detail = getErrorDetail(job.error);
          logger.error(
            `[YouTubeTranscript][${job.id}] Transcript job failed (retries left: ${job.numRetriesLeft}): ${detail}`,
          );
        },
      },
      {
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.crawler.youtubeTranscriptTimeoutSec * 2 + 10,
        concurrency: 1,
      },
    );
  }
}

async function runWorker(job: DequeuedJob<ZYouTubeTranscriptRequest>) {
  const jobId = job.id;
  const { bookmarkId } = job.data;
  addLogFields<"youtubeTranscriptWorker.run">({ "bookmark.id": bookmarkId });

  youtubeRateLimitUntil = Math.max(
    youtubeRateLimitUntil,
    await readRateLimitUntil(),
  );
  if (youtubeRateLimitUntil > Date.now()) {
    const delayMs = youtubeRateLimitUntil - Date.now();
    logger.warn(
      `[YouTubeTranscript][${jobId}] Pausing transcript requests after YouTube rate limiting for ${Math.ceil(delayMs / 60_000)} more minute(s)`,
    );
    throw new QueueRetryAfterError(
      "YouTube transcript requests are cooling down",
      delayMs,
    );
  }

  const [bookmark] = await db
    .select({
      url: bookmarkLinks.url,
      crawlStatus: bookmarkLinks.crawlStatus,
      htmlContent: bookmarkLinks.htmlContent,
      contentAssetId: bookmarkLinks.contentAssetId,
      userId: bookmarks.userId,
    })
    .from(bookmarkLinks)
    .innerJoin(bookmarks, eq(bookmarkLinks.id, bookmarks.id))
    .where(eq(bookmarkLinks.id, bookmarkId))
    .limit(1);

  if (!bookmark || !isYouTubeUrl(bookmark.url)) {
    logger.info(
      `[YouTubeTranscript][${jobId}] Skipping non-YouTube or missing bookmark`,
    );
    return;
  }

  if (bookmark.crawlStatus === "pending") {
    logger.info(
      `[YouTubeTranscript][${jobId}] Waiting for the crawler to finish before fetching subtitles`,
    );
    throw new QueueRetryAfterError(
      "Waiting for YouTube bookmark crawl to complete",
      CRAWL_WAIT_RETRY_MS,
    );
  }

  let htmlContent = bookmark.htmlContent ?? "";
  if (bookmark.contentAssetId) {
    const storedContent = await readAsset({
      userId: bookmark.userId,
      assetId: bookmark.contentAssetId,
    });
    htmlContent = storedContent.asset.toString("utf8");
  }

  if (htmlContent.includes('class="youtube-transcript"')) {
    logger.info(`[YouTubeTranscript][${jobId}] A transcript is already saved`);
    return;
  }

  if (nextTranscriptRequestAt > Date.now()) {
    throw new QueueRetryAfterError(
      "Spacing YouTube transcript requests",
      nextTranscriptRequestAt - Date.now(),
    );
  }
  nextTranscriptRequestAt = Date.now() + TRANSCRIPT_REQUEST_INTERVAL_MS;

  const runProxy = selectRunProxies();
  const proxy = getProxyAgent(bookmark.url, runProxy)?.proxy.toString();
  let transcripts;
  try {
    transcripts = await fetchYouTubeTranscript(
      bookmark.url,
      serverConfig.crawler.youtubeTranscriptLanguages,
      serverConfig.crawler.youtubeTranscriptTimeoutSec,
      job.abortSignal,
      proxy,
      (summary) =>
        logger.info(
          `[YouTubeTranscript][${jobId}] Selected caption tracks: ${summary}`,
        ),
    );
  } catch (error) {
    const detail = getErrorDetail(error);
    if (error instanceof TranslatedCaptionRateLimitError) {
      logger.warn(
        `[YouTubeTranscript][${jobId}] Auto-translated subtitles returned HTTP 429; recording failure and continuing with the next video. ${detail}`,
      );
      throw error;
    }
    if (/HTTP Error 429|Too Many Requests/i.test(detail)) {
      youtubeRateLimitUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      await persistRateLimitUntil(youtubeRateLimitUntil);
      logger.warn(
        `[YouTubeTranscript][${jobId}] YouTube returned HTTP 429; pausing transcript jobs for ${RATE_LIMIT_COOLDOWN_MS / 60_000} minutes. ${detail}`,
      );
      throw new QueueRetryAfterError(
        "YouTube returned HTTP 429 while fetching subtitles",
        RATE_LIMIT_COOLDOWN_MS,
      );
    }
    throw error;
  }

  if (transcripts.length === 0) {
    logger.info(
      `[YouTubeTranscript][${jobId}] No configured transcript languages are available`,
    );
    return;
  }

  const transcriptHtml = transcriptToHtml(transcripts, bookmark.url);
  const combinedHtml = [htmlContent, transcriptHtml].filter(Boolean).join("\n");
  const stored = await storeHtmlContent(combinedHtml, bookmark.userId, jobId);
  if (stored.result === "not_stored") {
    logger.warn(
      `[YouTubeTranscript][${jobId}] Could not store transcript content`,
    );
    return;
  }

  const oldContentAssetId = bookmark.contentAssetId;
  const obsoleteAssetIds: string[] = [];
  await db.transaction((txn) => {
    txn
      .update(bookmarkLinks)
      .set({
        htmlContent: stored.result === "store_inline" ? combinedHtml : null,
        contentAssetId: stored.result === "stored" ? stored.assetId : null,
      })
      .where(eq(bookmarkLinks.id, bookmarkId))
      .run();

    if (stored.result === "stored") {
      updateAsset(
        oldContentAssetId ?? undefined,
        {
          id: stored.assetId,
          bookmarkId,
          userId: bookmark.userId,
          assetType: AssetTypes.LINK_HTML_CONTENT,
          contentType: ASSET_TYPES.TEXT_HTML,
          size: stored.size,
          fileName: null,
        },
        txn,
      );
      if (oldContentAssetId) obsoleteAssetIds.push(oldContentAssetId);
    } else if (oldContentAssetId) {
      txn.delete(assets).where(eq(assets.id, oldContentAssetId)).run();
      obsoleteAssetIds.push(oldContentAssetId);
    }
  });

  await Promise.all(
    obsoleteAssetIds.map((assetId) =>
      silentDeleteAsset(bookmark.userId, assetId),
    ),
  );
  await triggerSearchReindex(bookmarkId, { groupId: bookmark.userId });
  logger.info(
    `[YouTubeTranscript][${jobId}] Added ${transcripts.length} transcript language(s): ${transcripts.map((item) => `${item.language}/${item.source}/${item.segments.length} segments`).join(", ")}`,
  );
}

async function readRateLimitUntil(): Promise<number> {
  try {
    const value = Number(await fs.readFile(RATE_LIMIT_STATE_FILE, "utf8"));
    if (Number.isFinite(value) && value > Date.now()) return value;
    await fs.rm(RATE_LIMIT_STATE_FILE, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn(
        `Could not read YouTube transcript cooldown state: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return 0;
}

async function persistRateLimitUntil(timestamp: number): Promise<void> {
  const temporaryFile = `${RATE_LIMIT_STATE_FILE}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporaryFile, `${timestamp}\n`, { mode: 0o600 });
    await fs.rename(temporaryFile, RATE_LIMIT_STATE_FILE);
  } catch (error) {
    await fs.rm(temporaryFile, { force: true });
    logger.warn(
      `Could not persist YouTube transcript cooldown state: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function getErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    const stderr = "stderr" in error ? error.stderr : undefined;
    if (typeof stderr === "string" && stderr.trim()) return stderr.trim();
    return error.message;
  }
  return String(error);
}
