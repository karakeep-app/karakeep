import * as restate from "@restatedev/restate-sdk";

import type {
  Queue,
  QueueOptions,
  RunnerFuncs,
  RunnerOptions,
} from "@karakeep/shared/queueing";
import { tryCatch } from "@karakeep/shared/tryCatch";

import { genId } from "./idProvider";
import { RestateSemaphore } from "./semaphore";

export function buildRestateService<T>(
  queue: Queue<T>,
  funcs: RunnerFuncs<T>,
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
    },
    handlers: {
      run: async (
        ctx: restate.Context,
        data: {
          payload: T;
          priority: number;
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
        for (let runNumber = 0; runNumber <= NUM_RETRIES; runNumber++) {
          await semaphore.acquire(priority);
          const res = await tryCatch(
            ctx.run(
              `main logic`,
              async () => {
                await funcs.run({
                  id,
                  data: payload,
                  priority,
                  runNumber,
                  abortSignal: AbortSignal.timeout(opts.timeoutSecs * 1000),
                });
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
                  funcs.onError?.({
                    id,
                    data: payload,
                    priority,
                    error: res.error,
                    runNumber,
                    numRetriesLeft: NUM_RETRIES - runNumber,
                  }),
                {
                  maxRetryAttempts: 1,
                },
              ),
            );
            await semaphore.release();
            lastError = res.error;
            // TODO: add backoff
            await ctx.sleep(1000);
          } else {
            const controller = new AbortController();
            await tryCatch(
              ctx.run(
                "onComplete",
                async () => {
                  if (funcs.onComplete) {
                    await funcs.onComplete({
                      id,
                      data: payload,
                      priority,
                      runNumber,
                      abortSignal: controller.signal,
                    });
                  }
                },
                {
                  maxRetryAttempts: 1,
                },
              ),
            );
            await semaphore.release();
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
