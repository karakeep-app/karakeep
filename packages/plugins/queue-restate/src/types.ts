import { z } from "zod";

/**
 * Zod schema for serialized errors that cross the RPC boundary.
 */
export const zSerializedError = z.object({
  name: z.string(),
  message: z.string(),
  stack: z.string().optional(),
});

export type SerializedError = z.infer<typeof zSerializedError>;

/**
 * Zod schema for job data passed from dispatcher to runner.
 */
export function zRunnerJobData<T extends z.ZodTypeAny>(payloadSchema: T) {
  return z.object({
    id: z.string(),
    data: payloadSchema,
    priority: z.number(),
    runNumber: z.number(),
    numRetriesLeft: z.number(),
    timeoutSecs: z.number(),
  });
}

export interface RunnerJobData<T> {
  id: string;
  data: T;
  priority: number;
  runNumber: number;
  numRetriesLeft: number;
  timeoutSecs: number;
}

/**
 * Zod schema for runner.run() response.
 */
export const zRunnerResult = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("success"),
    value: z.unknown(),
  }),
  z.object({
    type: z.literal("rate_limit"),
    delayMs: z.number(),
  }),
  z.object({
    type: z.literal("error"),
    error: zSerializedError,
  }),
]);

export type RunnerResult<R> =
  | { type: "success"; value: R }
  | { type: "rate_limit"; delayMs: number }
  | { type: "error"; error: SerializedError };

/**
 * Zod schema for runner.onCompleted() request.
 */
export function zOnCompletedRequest<T extends z.ZodTypeAny>(payloadSchema: T) {
  return z.object({
    job: zRunnerJobData(payloadSchema),
    result: z.unknown(),
  });
}

/**
 * Zod schema for runner.onError() request.
 */
export function zOnErrorRequest<T extends z.ZodTypeAny>(payloadSchema: T) {
  return z.object({
    job: zRunnerJobData(payloadSchema),
    error: zSerializedError,
  });
}
