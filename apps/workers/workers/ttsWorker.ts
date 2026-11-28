import { eq } from "drizzle-orm";
import { workerStatsCounter } from "../metrics";
import { withWorkerEventLog, withWorkerTracing } from "../workerTracing";

import { db } from "@karakeep/db";
import { assets, AssetTypes, bookmarks } from "@karakeep/db/schema";
import {
  addLogFields,
  newAssetId,
  QuotaService,
  saveAsset,
  silentDeleteAsset,
  TtsProviderConfig,
  TtsProviderConfigService,
  ttsErrorBody,
  ttsFetch,
  TtsQueue,
  ZTtsRequest,
  zTtsRequestSchema,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";
import {
  ttsChunkFileName,
  ttsContentType,
} from "@karakeep/shared/utils/ttsUtils";
import {
  getNarrationText,
  narrationChunks,
} from "@karakeep/trpc/lib/ttsNarration";

// Kept modest: most self-hosted OpenAI-compatible TTS servers run on a
// single GPU/CPU box, so piling on more concurrent requests just queues up
// on their side. Also bounds how many synthesized-but-unsaved chunks are
// held in memory at once.
const SYNTHESIS_CONCURRENCY = 4;

async function attemptMarkStatus(
  jobData: object | undefined,
  status: "failure",
) {
  if (!jobData) {
    return;
  }
  try {
    const request = zTtsRequestSchema.parse(jobData);
    await db
      .update(bookmarks)
      .set({ ttsStatus: status })
      .where(eq(bookmarks.id, request.bookmarkId));
  } catch (e) {
    logger.error(`Something went wrong when marking the tts status: ${e}`);
  }
}

export class TtsWorker {
  static async build() {
    logger.info("Starting tts worker ...");
    const worker = (await getQueueClient())!.createRunner<ZTtsRequest>(
      TtsQueue,
      {
        run: withWorkerTracing(
          "ttsWorker.run",
          withWorkerEventLog("ttsWorker.run", runTts),
        ),
        onComplete: async (job) => {
          workerStatsCounter.labels("tts", "completed").inc();
          logger.info(`[tts][${job.id}] Completed successfully`);
        },
        onError: async (job) => {
          workerStatsCounter.labels("tts", "failed").inc();
          logger.error(
            `[tts][${job.id}] tts job failed: ${job.error}\n${job.error.stack}`,
          );
          if (job.numRetriesLeft == 0) {
            workerStatsCounter.labels("tts", "failed_permanent").inc();
            await attemptMarkStatus(job?.data, "failure");
          }
        },
      },
      {
        concurrency: serverConfig.tts.numWorkers,
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.tts.jobTimeoutSec,
      },
    );
    return worker;
  }
}

export async function synthesizeChunk(
  text: string,
  provider: TtsProviderConfig,
  signal: AbortSignal,
): Promise<Buffer> {
  const { baseUrl, apiKey, model, voice } = provider;
  const response = await ttsFetch(`${baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      response_format: serverConfig.tts.responseFormat,
    }),
    signal: AbortSignal.any([
      signal,
      AbortSignal.timeout(serverConfig.tts.timeoutSec * 1000),
    ]),
  });
  if (!response.ok) {
    throw new Error(
      `TTS server returned ${response.status}: ${await ttsErrorBody(response)}`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function runTts(job: DequeuedJob<ZTtsRequest>) {
  const jobId = job.id;

  const request = zTtsRequestSchema.safeParse(job.data);
  if (!request.success) {
    throw new Error(
      `[tts][${jobId}] Got malformed job request: ${request.error.toString()}`,
    );
  }
  const { bookmarkId, voice } = request.data;

  const bookmarkRow = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    columns: { userId: true },
  });
  if (!bookmarkRow) {
    throw new Error(`[tts][${jobId}] Bookmark ${bookmarkId} not found`);
  }
  const { userId } = bookmarkRow;

  addLogFields<"ttsWorker.run">({ "bookmark.id": bookmarkId });

  // The TTS server is configured per-user, so it's the *bookmark owner's*
  // config that's used here, not necessarily whoever enqueued the job.
  const providerConfig = await TtsProviderConfigService.get(db, userId);
  if (!providerConfig) {
    // E.g. the server was removed after the job was queued. Leave a terminal
    // status so the client offers a retry instead of polling forever.
    logger.info(`[tts][${jobId}] No TTS server configured, giving up`);
    await db
      .update(bookmarks)
      .set({ ttsStatus: "failure" })
      .where(eq(bookmarks.id, bookmarkId));
    return;
  }
  // Narrowed to a local so the nested synthesizeAndSaveBatch closure below
  // (which TS can't narrow across) sees a non-null type.
  const provider: TtsProviderConfig = {
    ...providerConfig,
    voice: voice ?? providerConfig.voice,
  };

  const text = await getNarrationText(db, bookmarkId, userId);
  if (!text || !text.trim()) {
    logger.info(
      `[tts][${jobId}] No content found for bookmark ${bookmarkId}, skipping.`,
    );
    await db
      .update(bookmarks)
      .set({ ttsStatus: "failure", ttsVoice: null })
      .where(eq(bookmarks.id, bookmarkId));
    return;
  }

  const { chunks } = narrationChunks(text);
  addLogFields<"ttsWorker.run">({
    "tts.chunk_count": chunks.length,
    "tts.text_size": text.length,
  });
  logger.info(
    `[tts][${jobId}] Synthesizing ${chunks.length} chunk(s) for bookmark ${bookmarkId}`,
  );

  // Clean up any chunks left over from a previous attempt so filenames
  // (which encode playback order) start from a known state. The status goes
  // back to "pending" so clients hide the (about to be deleted) old audio.
  await db
    .update(bookmarks)
    .set({
      ttsStatus: "pending",
      ttsTotalChunks: null,
      ttsVoice: provider.voice,
    })
    .where(eq(bookmarks.id, bookmarkId));
  const oldChunks = await db.query.assets.findMany({
    where: (a, { eq, and }) =>
      and(eq(a.bookmarkId, bookmarkId), eq(a.assetType, AssetTypes.TTS_AUDIO)),
    columns: { id: true },
  });
  for (const old of oldChunks) {
    await db.delete(assets).where(eq(assets.id, old.id));
    await silentDeleteAsset(userId, old.id);
  }

  // Fail fast if the user is already over their storage quota, rather than
  // spending TTS server compute/API cost on chunks we already know we can't
  // keep.
  await QuotaService.checkStorageQuota(db, userId, 1);

  const total = chunks.length;
  const format = serverConfig.tts.responseFormat;
  const contentType = ttsContentType(format);
  await db
    .update(bookmarks)
    .set({ ttsTotalChunks: total })
    .where(eq(bookmarks.id, bookmarkId));

  // Synthesis runs concurrently, but chunks are saved (and their rows
  // inserted) strictly in order, one at a time. Every chunk becomes visible
  // to clients the moment it is stored, instead of only once the whole
  // article is done. Only a small window of upcoming chunks is requested at
  // a time, and each buffer is dropped once saved, so memory stays bounded
  // for long narrations.
  //
  // `job.abortSignal` fires when the job times out; aborting stops in-flight
  // requests, and the checks below stop this attempt from writing anything
  // more, so it can't interleave with the retry that replaces it.
  const controller = new AbortController();
  const abortSignal = AbortSignal.any([job.abortSignal, controller.signal]);
  const inFlight = new Map<number, Promise<Buffer>>();
  let nextToStart = 0;
  const fillWindow = (upTo: number) => {
    for (; nextToStart < Math.min(upTo, total); nextToStart++) {
      const p = synthesizeChunk(chunks[nextToStart], provider, abortSignal);
      // Rejections surface when the ordered loop below awaits them; this
      // just stops not-yet-awaited ones from becoming unhandled.
      p.catch(() => undefined);
      inFlight.set(nextToStart, p);
    }
  };

  let saved = 0;
  try {
    for (let index = 0; index < total; index++) {
      fillWindow(index + SYNTHESIS_CONCURRENCY);
      const buffer = await inFlight.get(index)!;
      inFlight.delete(index);
      job.abortSignal.throwIfAborted();
      const quotaApproved = await QuotaService.checkStorageQuota(
        db,
        userId,
        buffer.byteLength,
      );
      const assetId = newAssetId();
      const fileName = ttsChunkFileName(index, format);
      await saveAsset({
        userId,
        assetId,
        asset: buffer,
        metadata: { contentType, fileName },
        quotaApproved,
      });
      try {
        job.abortSignal.throwIfAborted();
        await db.insert(assets).values({
          id: assetId,
          bookmarkId,
          userId,
          assetType: AssetTypes.TTS_AUDIO,
          contentType,
          fileName,
          size: buffer.byteLength,
        });
      } catch (e) {
        // The file is stored but has no row; don't leak it.
        await silentDeleteAsset(userId, assetId);
        throw e;
      }
      saved++;
      await db
        .update(bookmarks)
        .set({ ttsStatus: saved === total ? "success" : "generating" })
        .where(eq(bookmarks.id, bookmarkId));
    }
  } catch (e) {
    controller.abort();
    if (saved > 0 && !job.abortSignal.aborted) {
      // Keep the chunks that did make it so they stay playable, but say
      // clearly that the narration is incomplete. A retry of the job starts
      // over from scratch. (A timed-out attempt writes nothing: its retry
      // owns the status now.)
      await db
        .update(bookmarks)
        .set({ ttsStatus: "failure" })
        .where(eq(bookmarks.id, bookmarkId));
    }
    throw e;
  }

  logger.info(
    `[tts][${jobId}] Saved ${saved} audio chunk(s) for bookmark ${bookmarkId}`,
  );
}
