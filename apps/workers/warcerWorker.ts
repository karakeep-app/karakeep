import { rm, stat } from "fs/promises";
import * as path from "path";
import { eq } from "drizzle-orm";
import { DequeuedJob, Runner } from "liteque";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

import { db } from "@karakeep/db";
import {
  assets,
  AssetTypes,
  bookmarkLinks,
  crawlSessions,
} from "@karakeep/db/schema";
import { saveAssetFromFile } from "@karakeep/shared/assetdb";
import logger from "@karakeep/shared/logger";
import {
  WarcerQueue,
  ZWarcerRequest,
  zWarcerRequestSchema,
} from "@karakeep/shared/queues";

const WARCER_URL = process.env.WARCER_URL ?? "http://warcer:8808/archive";
const WARCER_TIMEOUT = process.env.WARCER_TIMEOUT
  ? parseInt(process.env.WARCER_TIMEOUT, 10)
  : 300;

export class WarcerWorker {
  static build() {
    logger.info("Starting warcer worker...");
    return new Runner<ZWarcerRequest>(
      WarcerQueue,
      {
        run: runWarcerJob,
        onComplete: (job) => {
          logger.info(`[Warcer][${job.id}] completed`);
          return Promise.resolve();
        },
        onError: (job) => {
          logger.error(`[Warcer][${job.id}] failed: ${job.error}`);
          return Promise.resolve();
        },
      },
      {
        pollIntervalMs: 2000,
        concurrency: 1,
        timeoutSecs: WARCER_TIMEOUT,
        validator: zWarcerRequestSchema,
      },
    );
  }
}

async function cleanup(jobId: string, p: string) {
  try {
    await rm(p);
    logger.info(`[Warcer][${jobId}] deleted ${p}`);
  } catch (e) {
    logger.error(`[Warcer][${jobId}] rm failed ${p}: ${e}`);
  }
}

export async function runWarcerJob(job: DequeuedJob<ZWarcerRequest>) {
  const jobId = job.id;
  const { sessionId } = zWarcerRequestSchema.parse(job.data);

  logger.info(`[Warcer][${jobId}] session ${sessionId}`);

  const [session] = await db
    .select({ userId: crawlSessions.userId })
    .from(crawlSessions)
    .where(eq(crawlSessions.id, sessionId));
  if (!session) {
    logger.warn(`[Warcer][${jobId}] session not found, skipping`);
    return;
  }

  await db
    .update(crawlSessions)
    .set({ endedAt: Date.now() })
    .where(eq(crawlSessions.id, sessionId));

  const rows = await db
    .select({ bookmarkId: bookmarkLinks.id, url: bookmarkLinks.url })
    .from(bookmarkLinks)
    .where(eq(bookmarkLinks.sessionId, sessionId));
  if (rows.length === 0) {
    logger.warn(`[Warcer][${jobId}] no URLs to archive`);
    return;
  }

  logger.info(`[Warcer][${jobId}] sending ${rows.length} URLs`);
  let warcSrc: string;

  try {
    const resp = await fetch(WARCER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, urls: rows.map((r) => r.url) }),
    });
    if (!resp.ok) {
      const msg = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${msg}`);
    }
    ({ path: warcSrc } = (await resp.json()) as { path: string });
    logger.info(`[Warcer][${jobId}] got ${warcSrc}`);
  } catch (e) {
    logger.error(`[Warcer][${jobId}] warcer call failed: ${e}`);
    return;
  }

  try {
    await stat(warcSrc);
  } catch {
    logger.warn(`[Warcer][${jobId}] file not found: ${warcSrc}`);
    return;
  }

  const warcName = path.basename(warcSrc);
  const primaryBookmarkId = rows[0].bookmarkId;
  const assetId = uuidv4();
  const { size } = await stat(warcSrc);

  try {
    await saveAssetFromFile({
      userId: session.userId,
      assetId,
      assetPath: warcSrc,
      metadata: { contentType: "application/warc", fileName: warcName },
    });

    await db.insert(assets).values({
      id: assetId,
      bookmarkId: primaryBookmarkId,
      userId: session.userId,
      assetType: AssetTypes.LINK_WARC_ARCHIVE,
      contentType: "application/warc",
      size,
      fileName: warcName,
    });

    logger.info(
      `[Warcer][${jobId}] registered ${assetId} for ${primaryBookmarkId} (${size} bytes)`,
    );
  } catch (e) {
    logger.error(`[Warcer][${jobId}] save failed: ${e}`);
    await cleanup(jobId, warcSrc);
    throw e;
  }
}
