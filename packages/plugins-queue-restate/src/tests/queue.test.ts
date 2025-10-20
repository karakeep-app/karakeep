import {
  afterAll,
  afterEach,
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

type TestAction =
  | { type: "val"; val: number }
  | { type: "err"; err: string }
  | { type: "stall"; durSec: number };

describe("Restate Queue Provider", () => {
  let queueClient: QueueClient;
  let queue: Queue<TestAction>;
  let adminClient: AdminClient;

  const testState = {
    results: [] as number[],
    errors: [] as string[],
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
  afterEach(async () => {
    await waitUntilQueueEmpty();
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

    queue = queueClient.createQueue<TestAction>("test-queue", {
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
          const jobData = job.data;
          switch (jobData.type) {
            case "val":
              testState.results.push(jobData.val);
              break;
            case "err":
              throw new Error(jobData.err);
            case "stall":
              await new Promise((resolve) =>
                setTimeout(resolve, jobData.durSec * 1000),
              );
              break;
          }
        },
        onError: async (job) => {
          testState.inFlight--;
          const jobData = job.data;
          if (jobData && jobData.type === "err") {
            testState.errors.push(jobData.err);
          }
        },
        onComplete: async () => {
          testState.inFlight--;
        },
      },
      {
        concurrency: 3,
        timeoutSecs: 2,
        pollIntervalMs: 0 /* Doesn't matter */,
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
    const jobId = await queue.enqueue({ type: "val", val: 42 });

    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe("string");

    await waitUntilQueueEmpty();

    expect(testState.results).toEqual([42]);
  }, 60000);

  it("should process multiple jobs", async () => {
    await queue.enqueue({ type: "val", val: 1 });
    await queue.enqueue({ type: "val", val: 2 });
    await queue.enqueue({ type: "val", val: 3 });

    await waitUntilQueueEmpty();

    expect(testState.results.length).toEqual(3);
    expect(testState.results).toContain(1);
    expect(testState.results).toContain(2);
    expect(testState.results).toContain(3);
  }, 60000);

  it("should retry failed jobs", async () => {
    await queue.enqueue({ type: "err", err: "Test error" });

    await waitUntilQueueEmpty();

    // Initial attempt + 3 retries
    expect(testState.errors).toEqual([
      "Test error",
      "Test error",
      "Test error",
      "Test error",
    ]);
  }, 90000);

  it("should use idempotency key", async () => {
    const idempotencyKey = `test-${Date.now()}`;

    await queue.enqueue({ type: "val", val: 200 }, { idempotencyKey });
    await queue.enqueue({ type: "val", val: 200 }, { idempotencyKey });

    await waitUntilQueueEmpty();

    expect(testState.results).toEqual([200]);
  }, 60000);

  it("should handle concurrent jobs", async () => {
    const promises = [];
    for (let i = 300; i < 320; i++) {
      promises.push(queue.enqueue({ type: "stall", durSec: 0.1 }));
    }
    await Promise.all(promises);

    await waitUntilQueueEmpty();

    expect(testState.maxInFlight).toEqual(3);
  }, 60000);

  it("should handle priorities", async () => {
    // Hog the queue first
    await Promise.all([
      queue.enqueue({ type: "stall", durSec: 1 }, { priority: 0 }),
      queue.enqueue({ type: "stall", durSec: 1 }, { priority: 1 }),
      queue.enqueue({ type: "stall", durSec: 1 }, { priority: 2 }),
    ]);

    // Then those will get reprioritized
    await Promise.all([
      queue.enqueue({ type: "val", val: 200 }, { priority: -1 }),
      queue.enqueue({ type: "val", val: 201 }, { priority: -2 }),
      queue.enqueue({ type: "val", val: 202 }, { priority: -3 }),

      queue.enqueue({ type: "val", val: 300 }, { priority: 0 }),
      queue.enqueue({ type: "val", val: 301 }, { priority: 1 }),
      queue.enqueue({ type: "val", val: 302 }, { priority: 2 }),
    ]);

    await waitUntilQueueEmpty();

    expect(testState.results).toEqual([
      // Lower numeric priority value should run first
      202, 201, 200, 300, 301, 302,
    ]);
  }, 60000);
});
