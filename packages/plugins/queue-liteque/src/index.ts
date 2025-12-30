import path from "node:path";
import {
  buildDBClient,
  SqliteQueue as LQ,
  Runner as LQRunner,
  migrateDB,
  RetryAfterError,
} from "liteque";

import type { PluginProvider } from "@karakeep/shared/plugins";
import type {
  DequeuedJob,
  EnqueueOptions,
  Queue,
  QueueClient,
  QueueOptions,
  Runner,
  RunnerFuncs,
  RunnerOptions,
} from "@karakeep/shared/queueing";
import serverConfig from "@karakeep/shared/config";
import { QueueRetryAfterError } from "@karakeep/shared/queueing";

class LitequeQueueWrapper<T> implements Queue<T> {
  constructor(
    private readonly _name: string,
    private readonly lq: LQ<T>,
    public readonly opts: QueueOptions,
  ) {}

  name(): string {
    return this._name;
  }

  async enqueue(
    payload: T,
    options?: EnqueueOptions,
  ): Promise<string | undefined> {
    const job = await this.lq.enqueue(payload, options);
    // liteque returns a Job with numeric id
    return job ? String(job.id) : undefined;
  }

  async stats() {
    return this.lq.stats();
  }

  async cancelAllNonRunning(): Promise<number> {
    return this.lq.cancelAllNonRunning();
  }

  // Internal accessor for runner
  get _impl(): LQ<T> {
    return this.lq;
  }
}

class LitequeQueueClient implements QueueClient {
  private db = buildDBClient(path.join(serverConfig.dataDir, "queue.db"), {
    walEnabled: serverConfig.database.walMode,
  });

  private queues = new Map<string, LitequeQueueWrapper<unknown>>();

  async prepare(): Promise<void> {
    migrateDB(this.db);
  }

  async start(): Promise<void> {
    // No-op for sqlite
  }

  createQueue<T>(name: string, options: QueueOptions): Queue<T> {
    if (this.queues.has(name)) {
      throw new Error(`Queue ${name} already exists`);
    }
    const lq = new LQ<T>(name, this.db, {
      defaultJobArgs: { numRetries: options.defaultJobArgs.numRetries },
      keepFailedJobs: options.keepFailedJobs,
    });
    const wrapper = new LitequeQueueWrapper<T>(name, lq, options);
    this.queues.set(name, wrapper);
    return wrapper;
  }

  createRunner<T, R = void>(
    queue: Queue<T>,
    funcs: RunnerFuncs<T, R>,
    opts: RunnerOptions<T>,
  ): Runner<T> {
    const name = queue.name();
    let wrapper = this.queues.get(name);
    if (!wrapper) {
      throw new Error(`Queue ${name} not found`);
    }

    // Wrap the run function to translate QueueRetryAfterError to liteque's RetryAfterError
    const wrappedRun = async (job: DequeuedJob<T>): Promise<R> => {
      try {
        return await funcs.run(job);
      } catch (error) {
        if (error instanceof QueueRetryAfterError) {
          // Translate to liteque's native RetryAfterError
          // This will cause liteque to retry after the delay without counting against attempts
          throw new RetryAfterError(error.delayMs);
        }
        // Re-throw any other errors
        throw error;
      }
    };

    const runner = new LQRunner<T, R>(
      wrapper._impl,
      {
        run: wrappedRun,
        onComplete: funcs.onComplete,
        onError: funcs.onError,
      },
      {
        pollIntervalMs: opts.pollIntervalMs ?? 1000,
        timeoutSecs: opts.timeoutSecs,
        concurrency: opts.concurrency,
        validator: opts.validator,
      },
    );

    return {
      run: () => runner.run(),
      stop: () => runner.stop(),
      runUntilEmpty: () => runner.runUntilEmpty(),
    };
  }

  async shutdown(): Promise<void> {
    // No-op for sqlite
  }
}

export class LitequeQueueProvider implements PluginProvider<QueueClient> {
  private client: QueueClient | null = null;

  async getClient(): Promise<QueueClient | null> {
    if (!this.client) {
      const client = new LitequeQueueClient();
      this.client = client;
    }
    return this.client;
  }
}
