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
          const res = await runWorkerLogic(ctx, funcs, {
            id,
            data: payload,
            priority,
            runNumber,
            numRetriesLeft: NUM_RETRIES - runNumber,
            abortSignal: AbortSignal.timeout(opts.timeoutSecs * 1000),
          });
          await semaphore.release();
          if (res.error) {
            lastError = res.error;
            // TODO: add backoff
            await ctx.sleep(1000);
          } else {
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

async function runWorkerLogic<T>(
  ctx: restate.Context,
  { run, onError, onComplete }: RunnerFuncs<T>,
  data: {
    id: string;
    data: T;
    priority: number;
    runNumber: number;
    numRetriesLeft: number;
    abortSignal: AbortSignal;
  },
) {
  const res = await tryCatch(
    ctx.run(
      `main logic`,
      async () => {
        await run(data);
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
    return res;
  }

  await tryCatch(
    ctx.run("onComplete", async () => await onComplete?.(data), {
      maxRetryAttempts: 1,
    }),
  );
  return res;
}
