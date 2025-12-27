import * as restate from "@restatedev/restate-sdk";

import type {
  Queue,
  QueueOptions,
  RunnerFuncs,
  RunnerOptions,
} from "@karakeep/shared/queueing";
import { QueueRetryAfterError } from "@karakeep/shared/queueing";
import { tryCatch } from "@karakeep/shared/tryCatch";

import { genId } from "./idProvider";
import { RestateSemaphore } from "./semaphore";

export function buildRestateService<T, R>(
  queue: Queue<T>,
  funcs: RunnerFuncs<T, R>,
  opts: RunnerOptions<T>,
  queueOpts: QueueOptions,
) {
  const NUM_RETRIES = queueOpts.defaultJobArgs.numRetries;
  return restate.service({
    name: queue.name(),
    options: {
      inactivityTimeout: {
        seconds: opts.timeoutSecs,
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
        const id = `${await genId(ctx)}`;
        let payload = data.payload;
        if (opts.validator) {
          const res = opts.validator.safeParse(data.payload);
          if (!res.success) {
            throw new restate.TerminalError(res.error.message, {
              errorCode: 400,
            });
          }
          payload = res.data;
        }

        const priority = data.priority ?? 0;

        const semaphore = new RestateSemaphore(
          ctx,
          `queue:${queue.name()}`,
          opts.concurrency,
        );

        let lastError: Error | undefined;
        let runNumber = 0;
        while (runNumber <= NUM_RETRIES) {
          const acquired = await semaphore.acquire(
            priority,
            data.groupId,
            data.queuedIdempotencyKey,
          );
          if (!acquired) {
            return;
          }
          const res = await runWorkerLogic(ctx, funcs, {
            id,
            data: payload,
            priority,
            runNumber,
            numRetriesLeft: NUM_RETRIES - runNumber,
            abortSignal: AbortSignal.timeout(opts.timeoutSecs * 1000),
          });
          await semaphore.release();

          if (res.type === "rate_limit") {
            // Handle rate limit retries without counting against retry attempts
            await ctx.sleep(res.delayMs, "rate limit retry");
            // Don't increment runNumber - retry without counting against attempts
            continue;
          }

          if (res.type === "error") {
            if (res.error instanceof restate.CancelledError) {
              throw res.error;
            }
            lastError = res.error;
            // TODO: add backoff
            await ctx.sleep(1000, "error retry");
            runNumber++;
          } else {
            // Success
            break;
          }
        }
        if (lastError) {
          throw new restate.TerminalError(lastError.message, {
            errorCode: 500,
            cause: "cause" in lastError ? lastError.cause : undefined,
          });
        }
      },
    },
  });
}

type RunResult<R> =
  | { type: "success"; value: R }
  | { type: "rate_limit"; delayMs: number }
  | { type: "error"; error: Error };

async function runWorkerLogic<T, R>(
  ctx: restate.Context,
  { run, onError, onComplete }: RunnerFuncs<T, R>,
  data: {
    id: string;
    data: T;
    priority: number;
    runNumber: number;
    numRetriesLeft: number;
    abortSignal: AbortSignal;
  },
): Promise<RunResult<R>> {
  const res = await tryCatch(
    ctx.run(
      `main logic`,
      async () => {
        const res = await tryCatch(run(data));
        if (res.error) {
          if (res.error instanceof QueueRetryAfterError) {
            return { type: "rate_limit" as const, delayMs: res.error.delayMs };
          }
          throw res.error; // Rethrow
        }
        return { type: "success" as const, value: res.data };
      },
      {
        maxRetryAttempts: 1,
      },
    ),
  );

  if (res.error) {
    await tryCatch(
      ctx.run(
        `onError`,
        async () =>
          onError?.({
            ...data,
            error: res.error,
          }),
        {
          maxRetryAttempts: 1,
        },
      ),
    );
    return { type: "error", error: res.error };
  }

  const result = res.data;

  if (result.type === "rate_limit") {
    // Don't call onError or onComplete for rate limit retries
    return result;
  }

  // Success case - call onComplete
  await tryCatch(
    ctx.run("onComplete", async () => await onComplete?.(data, result.value), {
      maxRetryAttempts: 1,
    }),
  );
  return result;
}
