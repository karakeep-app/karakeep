import * as restate from "@restatedev/restate-sdk";
import * as restateClient from "@restatedev/restate-sdk-clients";

import type { PluginProvider } from "@karakeep/shared/plugins";
import type {
  EnqueueOptions,
  Queue,
  QueueClient,
  QueueOptions,
  Runner,
  RunnerFuncs,
  RunnerOptions,
} from "@karakeep/shared/queueing";
import logger from "@karakeep/shared/logger";

import { AdminClient } from "./admin";
import { envConfig } from "./env";
import { idProvider } from "./idProvider";
import { semaphore } from "./semaphore";
import { buildRestateService } from "./service";

class RestateQueueWrapper<T> implements Queue<T> {
  constructor(
    private readonly _name: string,
    private readonly client: restateClient.Ingress,
    private readonly adminClient: AdminClient,
    public readonly opts: QueueOptions,
  ) {}

  name(): string {
    return this._name;
  }

  async enqueue(
    payload: T,
    options?: EnqueueOptions,
  ): Promise<string | undefined> {
    interface MyService {
      run: (
        ctx: restate.Context,
        data: {
          payload: T;
          priority: number;
        },
      ) => Promise<void>;
    }
    const cl = this.client.serviceSendClient<MyService>({ name: this.name() });
    const res = await cl.run(
      {
        payload,
        priority: options?.priority ?? 0,
      },
      restateClient.rpc.sendOpts({
        delay: options?.delayMs
          ? {
              milliseconds: options.delayMs,
            }
          : undefined,
        idempotencyKey: options?.idempotencyKey,
      }),
    );
    return res.invocationId;
  }

  async stats(): Promise<{
    pending: number;
    pending_retry: number;
    running: number;
    failed: number;
  }> {
    const res = await this.adminClient.getStats(this.name());
    return {
      pending: res.pending + res.ready,
      pending_retry: res["backing-off"] + res.paused + res.suspended,
      running: res.running,
      failed: 0,
    };
  }

  async cancelAllNonRunning(): Promise<number> {
    throw new Error("Method not implemented.");
  }
}

class RestateRunnerWrapper<T> implements Runner<T> {
  constructor(
    private readonly wf: restate.ServiceDefinition<
      string,
      {
        run: (ctx: restate.Context, data: T) => Promise<void>;
      }
    >,
  ) {}

  async run(): Promise<void> {
    // No-op for restate
  }

  async stop(): Promise<void> {
    // No-op for restate
  }

  async runUntilEmpty(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  get def(): restate.WorkflowDefinition<string, unknown> {
    return this.wf;
  }
}

class RestateQueueClient implements QueueClient {
  private client: restateClient.Ingress;
  private adminClient: AdminClient;
  private queues = new Map<string, RestateQueueWrapper<unknown>>();
  private services = new Map<string, RestateRunnerWrapper<unknown>>();

  constructor() {
    this.client = restateClient.connect({
      url: envConfig.RESTATE_INGRESS_ADDR,
    });
    this.adminClient = new AdminClient(envConfig.RESTATE_ADMIN_ADDR);
  }

  async prepare(): Promise<void> {
    // No-op for restate
  }

  async start(): Promise<void> {
    const port = await restate.serve({
      port: envConfig.RESTATE_LISTEN_PORT ?? 0,
      services: [
        ...[...this.services.values()].map((svc) => svc.def),
        semaphore,
        idProvider,
      ],
      identityKeys: envConfig.RESTATE_PUB_KEY
        ? [envConfig.RESTATE_PUB_KEY]
        : undefined,
      logger: (meta, msg) => {
        if (meta.context) {
          // No need to log invocation logs
        } else {
          logger.log(meta.level, `[restate] ${msg}`);
        }
      },
    });
    logger.info(`Restate listening on port ${port}`);
  }

  createQueue<T>(name: string, opts: QueueOptions): Queue<T> {
    if (this.queues.has(name)) {
      throw new Error(`Queue ${name} already exists`);
    }
    const wrapper = new RestateQueueWrapper<T>(
      name,
      this.client,
      this.adminClient,
      opts,
    );
    this.queues.set(name, wrapper);
    return wrapper;
  }

  createRunner<T>(
    queue: Queue<T>,
    funcs: RunnerFuncs<T>,
    opts: RunnerOptions<T>,
  ): Runner<T> {
    const name = queue.name();
    let wrapper = this.services.get(name);
    if (wrapper) {
      throw new Error(`Queue ${name} already exists`);
    }
    const svc = new RestateRunnerWrapper<T>(
      buildRestateService(queue, funcs, opts, queue.opts),
    );
    this.services.set(name, svc);
    return svc;
  }

  async shutdown(): Promise<void> {
    // No-op for sqlite
  }
}

export class RestateQueueProvider implements PluginProvider<QueueClient> {
  private client: QueueClient | null = null;

  static isConfigured(): boolean {
    return envConfig.RESTATE_LISTEN_PORT !== undefined;
  }

  async getClient(): Promise<QueueClient | null> {
    if (!this.client) {
      const client = new RestateQueueClient();
      this.client = client;
    }
    return this.client;
  }
}
