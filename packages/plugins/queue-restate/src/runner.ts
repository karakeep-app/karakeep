import * as restate from "@restatedev/restate-sdk";

import type { RunnerFuncs, RunnerOptions } from "@karakeep/shared/queueing";
import { QueueRetryAfterError } from "@karakeep/shared/queueing";
import { tryCatch } from "@karakeep/shared/tryCatch";

import type { RunnerJobData, RunnerResult, SerializedError } from "./types";

function timeoutSignal(timeoutSecs: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Job timed out after ${timeoutSecs} seconds`));
  }, timeoutSecs * 1000);
  // Don't keep the process alive just for this timer
  // TODO: Fix the monorepo type mismatch - mobile sees setTimeout returning number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (timer as any).unref?.();
  return controller.signal;
}

function serializeError(error: Error): SerializedError {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

export function runnerServiceName(queueName: string): string {
  return `${queueName}-runner`;
}

export function buildRunnerService<T, R>(
  queueName: string,
  funcs: RunnerFuncs<T, R>,
  opts: RunnerOptions<T>,
) {
  return restate.service({
    name: runnerServiceName(queueName),
    options: {
      ingressPrivate: true,
      inactivityTimeout: {
        seconds: opts.timeoutSecs * 2,
      },
      journalRetention: {
        days: 3,
      },
    },
    handlers: {
      run: restate.handlers.handler(
        {
          // No retries at runner level - dispatcher handles retry logic
          retryPolicy: {
            maxAttempts: 1,
          },
        },
        async (
          ctx: restate.Context,
          jobData: RunnerJobData<T>,
        ): Promise<RunnerResult<R>> => {
          // Validate payload if validator provided
          let payload = jobData.data;
          if (opts.validator) {
            const res = opts.validator.safeParse(jobData.data);
            if (!res.success) {
              return {
                type: "error",
                error: {
                  name: "ValidationError",
                  message: res.error.message,
                },
              };
            }
            payload = res.data;
          }

          const res = await tryCatch(
            ctx
              .run(
                "main logic",
                async () => {
                  const result = await tryCatch(
                    funcs.run({
                      id: jobData.id,
                      data: payload,
                      priority: jobData.priority,
                      runNumber: jobData.runNumber,
                      abortSignal: timeoutSignal(jobData.timeoutSecs),
                    }),
                  );
                  if (result.error) {
                    if (result.error instanceof QueueRetryAfterError) {
                      return {
                        type: "rate_limit" as const,
                        delayMs: result.error.delayMs,
                      };
                    }
                    return {
                      type: "error" as const,
                      error: serializeError(result.error),
                    };
                  }
                  return { type: "success" as const, value: result.data };
                },
                {
                  maxRetryAttempts: 1,
                },
              )
              .orTimeout({
                seconds: jobData.timeoutSecs * 1.1,
              }),
          );

          if (res.error) {
            return {
              type: "error",
              error: serializeError(res.error),
            };
          }

          return res.data as RunnerResult<R>;
        },
      ),

      onCompleted: async (
        ctx: restate.Context,
        data: { job: RunnerJobData<T>; result: R },
      ): Promise<void> => {
        await ctx.run("onComplete", async () => {
          await funcs.onComplete?.(
            {
              id: data.job.id,
              data: data.job.data,
              priority: data.job.priority,
              runNumber: data.job.runNumber,
              abortSignal: timeoutSignal(data.job.timeoutSecs),
            },
            data.result,
          );
        });
      },

      onError: async (
        ctx: restate.Context,
        data: { job: RunnerJobData<T>; error: SerializedError },
      ): Promise<void> => {
        // Reconstruct the error
        const reconstructedError = Object.assign(
          new Error(data.error.message),
          {
            name: data.error.name,
            stack: data.error.stack,
          },
        );

        await ctx.run("onError", async () => {
          await funcs.onError?.({
            id: data.job.id,
            data: data.job.data,
            priority: data.job.priority,
            runNumber: data.job.runNumber,
            numRetriesLeft: data.job.numRetriesLeft,
            error: reconstructedError,
          });
        });
      },
    },
  });
}
