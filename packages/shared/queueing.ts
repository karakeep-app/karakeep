import { ZodType } from "zod";

import { PluginManager, PluginType } from "./plugins";

export interface EnqueueOptions {
  idempotencyKey?: string;
  priority?: number;
  delayMs?: number;
}

export interface QueueOptions {
  defaultJobArgs: {
    numRetries: number;
  };
  keepFailedJobs: boolean;
}

export interface DequeuedJob<T> {
  id: string;
  data: T;
  priority: number;
  runNumber: number;
  abortSignal: AbortSignal;
}

export interface DequeuedJobError<T> {
  id: string;
  data?: T;
  priority: number;
  error: Error;
  runNumber: number;
  numRetriesLeft: number;
}

export interface RunnerFuncs<T> {
  run: (job: DequeuedJob<T>) => Promise<void>;
  onComplete?: (job: DequeuedJob<T>) => Promise<void>;
  onError?: (job: DequeuedJobError<T>) => Promise<void>;
}

export interface RunnerOptions<T> {
  pollIntervalMs?: number;
  timeoutSecs: number;
  concurrency: number;
  validator?: ZodType<T>;
}

export interface Queue<T> {
  opts: QueueOptions;
  name(): string;
  enqueue(payload: T, options?: EnqueueOptions): Promise<string | undefined>;
  stats(): Promise<{
    pending: number;
    pending_retry: number;
    running: number;
    failed: number;
  }>;
  cancelAllNonRunning?(): Promise<number>;
}

export interface Runner<_T> {
  run(): Promise<void>;
  stop(): void;
  runUntilEmpty?(): Promise<void>;
}

export interface QueueClient {
  prepare(): Promise<void>;
  start(): Promise<void>;
  createQueue<T>(name: string, options: QueueOptions): Queue<T>;
  createRunner<T>(
    queue: Queue<T>,
    funcs: RunnerFuncs<T>,
    opts: RunnerOptions<T>,
  ): Runner<T>;
  shutdown?(): Promise<void>;
}

export async function getQueueClient(): Promise<QueueClient> {
  const client = await PluginManager.getClient(PluginType.Queue);
  if (!client) {
    throw new Error("Failed to get queue client");
  }
  return client;
}
