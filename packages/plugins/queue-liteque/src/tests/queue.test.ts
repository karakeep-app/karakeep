import { buildDBClient, migrateDB, SqliteQueue } from "liteque";
import { describe, expect, test } from "vitest";

import { LitequeQueueWrapper } from "../index";

describe("LitequeQueueWrapper", () => {
  test("clears only failed jobs for the completed bookmark", async () => {
    const db = buildDBClient(":memory:");
    migrateDB(db);
    const options = {
      defaultJobArgs: { numRetries: 0 },
      keepFailedJobs: true,
    };
    const liteque = new SqliteQueue<{ bookmarkId: string }>(
      "youtube_transcript_queue",
      db,
      options,
    );
    const queue = new LitequeQueueWrapper(
      "youtube_transcript_queue",
      liteque,
      options,
    );

    const failJob = async (bookmarkId: string) => {
      await queue.enqueue({ bookmarkId });
      const job = await liteque.attemptDequeue({ timeoutSecs: 10 });
      expect(job).not.toBeNull();
      await liteque.finalize(job!.id, job!.allocationId, "failed");
    };
    await failJob("completed-bookmark");
    await failJob("other-bookmark");
    await queue.enqueue({ bookmarkId: "completed-bookmark" });
    const otherQueue = new SqliteQueue<{ bookmarkId: string }>(
      "other_queue",
      db,
      options,
    );
    await otherQueue.enqueue({ bookmarkId: "completed-bookmark" });
    const otherJob = await otherQueue.attemptDequeue({ timeoutSecs: 10 });
    expect(otherJob).not.toBeNull();
    await otherQueue.finalize(otherJob!.id, otherJob!.allocationId, "failed");

    expect(await queue.clearFailedJobsForBookmark("completed-bookmark")).toBe(
      1,
    );
    expect(await queue.stats()).toMatchObject({ pending: 1, failed: 1 });
    expect(await otherQueue.stats()).toMatchObject({ failed: 1 });
    expect(await queue.clearFailedJobsForBookmark("completed-bookmark")).toBe(
      0,
    );
  });
});
