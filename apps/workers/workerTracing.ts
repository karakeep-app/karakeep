import type { DequeuedJob } from "@karakeep/shared/queueing";
import { getTracer, withSpan } from "@karakeep/shared-server";

const tracer = getTracer("@karakeep/workers");

type WorkerRunFn<TData, TResult = void> = (
  job: DequeuedJob<TData>,
) => Promise<TResult>;

/**
 * Wraps a worker run function with OpenTelemetry tracing.
 * Creates a span for each job execution and automatically handles error recording.
 *
 * @param name - The name of the span (e.g., "feedWorker.run", "crawlerWorker.run")
 * @param fn - The worker run function to wrap
 * @returns A wrapped function that executes within a traced span
 *
 * @example
 * ```ts
 * const run = withWorkerTracing("feedWorker.run", async (job) => {
 *   // Your worker logic here
 * });
 * ```
 */
export function withWorkerTracing<TData, TResult = void>(
  name: string,
  fn: WorkerRunFn<TData, TResult>,
): WorkerRunFn<TData, TResult> {
  return async (job: DequeuedJob<TData>): Promise<TResult> => {
    return await withSpan(
      tracer,
      name,
      {
        attributes: {
          "job.id": job.id,
          "job.priority": job.priority,
          "job.runNumber": job.runNumber,
        },
      },
      () => fn(job),
    );
  };
}
