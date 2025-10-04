import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from "vitest";

import type { Queue, QueueClient } from "@karakeep/shared/queueing";

import { AdminClient } from "../admin.js";
import { RestateQueueProvider } from "../index.js";
import { waitUntil } from "./utils.js";

describe("Restate Queue Provider", () => {
  let queueClient: QueueClient;
  let queue: Queue<{ value: number }>;
  let adminClient: AdminClient;

  const testState = {
    results: [] as number[],
    errors: [] as number[],
    inFlight: 0,
    maxInFlight: 0,
  };

  async function waitUntilQueueEmpty() {
    await waitUntil(
      async () => {
        const stats = await queue.stats();
        return stats.pending + stats.pending_retry + stats.running === 0;
      },
      "Queue to be empty",
      60000,
    );
  }

  beforeEach(async () => {
    testState.results = [];
    testState.errors = [];
    testState.inFlight = 0;
    testState.maxInFlight = 0;
  });

  beforeAll(async () => {
    const ingressPort = inject("restateIngressPort");
    const adminPort = inject("restateAdminPort");

    process.env.RESTATE_INGRESS_ADDR = `http://localhost:${ingressPort}`;
    process.env.RESTATE_ADMIN_ADDR = `http://localhost:${adminPort}`;
    process.env.RESTATE_LISTEN_PORT = "9080";

    const provider = new RestateQueueProvider();
    const client = await provider.getClient();

    if (!client) {
      throw new Error("Failed to create queue client");
    }

    queueClient = client;
    adminClient = new AdminClient(process.env.RESTATE_ADMIN_ADDR);

    queue = queueClient.createQueue<{ value: number }>("test-queue", {
      defaultJobArgs: {
        numRetries: 3,
      },
      keepFailedJobs: false,
    });

    queueClient.createRunner(
      queue,
      {
        run: async (job) => {
          testState.inFlight++;
          testState.maxInFlight = Math.max(
            testState.maxInFlight,
            testState.inFlight,
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
          testState.results.push(job.data.value);
          if (job.data.value === 999) {
            throw new Error("Test error");
          }
        },
        onError: async (job) => {
          testState.inFlight--;
          testState.maxInFlight = Math.max(
            testState.maxInFlight,
            testState.inFlight,
          );
          if (job.data) {
            testState.errors.push(job.data.value);
          }
        },
        onComplete: async () => {
          testState.inFlight--;
          testState.maxInFlight = Math.max(
            testState.maxInFlight,
            testState.inFlight,
          );
        },
      },
      {
        concurrency: 3,
        timeoutSecs: 30,
        pollIntervalMs: 100,
      },
    );

    await queueClient.prepare();
    await queueClient.start();

    await adminClient.upsertDeployment("http://host.docker.internal:9080");
  }, 90000);

  afterAll(async () => {
    if (queueClient?.shutdown) {
      await queueClient.shutdown();
    }
  });

  it("should enqueue and process a job", async () => {
    const jobId = await queue.enqueue({ value: 42 });

    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe("string");

    await waitUntilQueueEmpty();

    expect(testState.results).toEqual([42]);
  }, 60000);

  it("should process multiple jobs", async () => {
    await queue.enqueue({ value: 1 });
    await queue.enqueue({ value: 2 });
    await queue.enqueue({ value: 3 });

    await waitUntilQueueEmpty();

    expect(testState.results.length).toEqual(3);
    expect(testState.results).toContain(1);
    expect(testState.results).toContain(2);
    expect(testState.results).toContain(3);
  }, 60000);

  it("should retry failed jobs", async () => {
    await queue.enqueue({ value: 999 });

    await waitUntilQueueEmpty();

    // Initial attempt + 3 retries
    expect(testState.errors).toEqual([999, 999, 999, 999]);
  }, 90000);

  it("should use idempotency key", async () => {
    const idempotencyKey = `test-${Date.now()}`;

    await queue.enqueue({ value: 200 }, { idempotencyKey });
    await queue.enqueue({ value: 200 }, { idempotencyKey });

    await waitUntilQueueEmpty();

    expect(testState.results).toEqual([200]);
  }, 60000);

  it("should handle concurrent jobs", async () => {
    const promises = [];
    for (let i = 300; i < 320; i++) {
      promises.push(queue.enqueue({ value: i }));
    }
    await Promise.all(promises);

    await waitUntilQueueEmpty();

    expect(testState.maxInFlight).toEqual(3);
  }, 60000);

  it("should handle priorities", async () => {
    // Those will probably go together
    await queue.enqueue({ value: 100 }, { priority: 10 });
    await queue.enqueue({ value: 101 }, { priority: 11 });
    await queue.enqueue({ value: 102 }, { priority: 12 });

    // Then those will get reprioritized
    await Promise.all([
      queue.enqueue({ value: 200 }, { priority: -1 }),
      queue.enqueue({ value: 201 }, { priority: -2 }),
      queue.enqueue({ value: 202 }, { priority: -3 }),

      queue.enqueue({ value: 300 }, { priority: 0 }),
      queue.enqueue({ value: 301 }, { priority: 1 }),
      queue.enqueue({ value: 302 }, { priority: 2 }),
    ]);

    await waitUntilQueueEmpty();

    expect(testState.results).toEqual([
      // The initial batch
      100, 101, 102,

      // Then in order of increasing priority
      302, 301, 300, 200, 201, 202,
    ]);
  }, 60000);
});
