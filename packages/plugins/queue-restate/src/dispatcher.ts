import * as restate from "@restatedev/restate-sdk";

import type {
  Queue,
  QueueOptions,
  RunnerOptions,
} from "@karakeep/shared/queueing";
import logger from "@karakeep/shared/logger";
import { tryCatch } from "@karakeep/shared/tryCatch";

import type { RunnerJobData, RunnerResult, SerializedError } from "./types";
import { runnerServiceName } from "./runner";
import { RestateSemaphore } from "./semaphore";

export function buildDispatcherService<T, R>(
  queue: Queue<T>,
  opts: RunnerOptions<T>,
  queueOpts: QueueOptions,
) {
  const NUM_RETRIES = queueOpts.defaultJobArgs.numRetries;
  const runnerName = runnerServiceName(queue.name());

  // Type definition for the runner service client
  // Note: ctx parameter is required for Restate SDK to correctly infer client method signatures
  interface RunnerService {
    run: (
      ctx: restate.Context,
      data: RunnerJobData<T>,
    ) => Promise<RunnerResult<R>>;
    onCompleted: (
      ctx: restate.Context,
      data: { job: RunnerJobData<T>; result: R },
    ) => Promise<void>;
    onError: (
      ctx: restate.Context,
      data: { job: RunnerJobData<T>; error: SerializedError },
    ) => Promise<void>;
  }

  return restate.service({
    name: queue.name(),
    options: {
      inactivityTimeout: {
        seconds: opts.timeoutSecs * 2,
      },
      retryPolicy: {
        maxAttempts: NUM_RETRIES,
        initialInterval: {
          seconds: 5,
        },
        maxInterval: {
          minutes: 1,
        },
      },
      journalRetention: {
        days: 3,
      },
    },
    handlers: {
      run: async (
        ctx: restate.Context,
        data: {
          payload: T;
          queuedIdempotencyKey?: string;
          priority: number;
          groupId?: string;
        },
      ) => {
        const id = ctx.rand.uuidv4();
        const priority = data.priority ?? 0;
        const logDebug = async (message: string) => {
          await ctx.run(
            "log",
            async () => {
              logger.debug(message);
            },
            {
              maxRetryAttempts: 1,
            },
          );
        };

        const semaphore = new RestateSemaphore(
          ctx,
          `queue:${queue.name()}`,
          opts.concurrency,
          Math.ceil(opts.timeoutSecs * 1.5 * 1000),
        );

        const runner = ctx.serviceClient<RunnerService>({ name: runnerName });

        let runNumber = 0;
        while (runNumber <= NUM_RETRIES) {
          await logDebug(
            `Dispatcher attempt ${runNumber} for queue ${queue.name()} job ${id} (priority=${priority}, groupId=${data.groupId ?? "none"})`,
          );
          const leaseId = await semaphore.acquire(
            priority,
            data.groupId,
            data.queuedIdempotencyKey,
          );
          if (!leaseId) {
            // Idempotency key already exists, skip
            await logDebug(
              `Dispatcher skipping queue ${queue.name()} job ${id} due to existing idempotency key`,
            );
            return;
          }
          await logDebug(
            `Dispatcher acquired lease ${leaseId} for queue ${queue.name()} job ${id}`,
          );

          const jobData: RunnerJobData<T> = {
            id,
            data: data.payload,
            priority,
            runNumber,
            numRetriesLeft: NUM_RETRIES - runNumber,
            timeoutSecs: opts.timeoutSecs,
          };

          // Call the runner service
          const res = await tryCatch(runner.run(jobData));

          // Handle RPC-level errors (e.g., runner service unavailable)
          if (res.error) {
            await logDebug(
              `Dispatcher RPC error for queue ${queue.name()} job ${id}: ${res.error instanceof Error ? res.error.message : String(res.error)}`,
            );
            await semaphore.release(leaseId);
            if (res.error instanceof restate.CancelledError) {
              throw res.error;
            }
            // Retry with backoff
            await ctx.sleep(1000, "rpc error retry");
            runNumber++;
            continue;
          }

          const result = res.data;

          if (result.type === "rate_limit") {
            // Rate limit - release semaphore, sleep, and retry without incrementing runNumber
            await logDebug(
              `Dispatcher rate limit for queue ${queue.name()} job ${id} (delayMs=${result.delayMs})`,
            );
            await semaphore.release(leaseId);
            await ctx.sleep(result.delayMs, "rate limit retry");
            continue;
          }

          if (result.type === "error") {
            // Call onError on the runner BEFORE releasing semaphore
            // This ensures inFlight tracking stays consistent
            await logDebug(
              `Dispatcher runner error for queue ${queue.name()} job ${id}: ${result.error.message}`,
            );
            await tryCatch(
              runner.onError({
                job: jobData,
                error: result.error,
              }),
            );
            await semaphore.release(leaseId);

            // Retry with backoff
            await ctx.sleep(1000, "error retry");
            runNumber++;
            continue;
          }

          // Success - call onCompleted BEFORE releasing semaphore
          // This ensures inFlight tracking stays consistent
          await logDebug(
            `Dispatcher completed queue ${queue.name()} job ${id}`,
          );
          await tryCatch(
            runner.onCompleted({
              job: jobData,
              result: result.value,
            }),
          );
          await semaphore.release(leaseId);
          break;
        }
      },
    },
  });
}
