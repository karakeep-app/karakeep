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
              return jobData.val;
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
        onComplete: async (_j, res) => {
          testState.inFlight--;
          if (res) {
            testState.results.push(res);
          }
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

  it("should handle groupID fairness within same priority", async () => {
    // First, hog the queue with a long-running task
    await queue.enqueue({ type: "stall", durSec: 1 }, { priority: 0 });
    await queue.enqueue({ type: "stall", durSec: 1 }, { priority: 0 });
    await queue.enqueue({ type: "stall", durSec: 1 }, { priority: 0 });

    // Now enqueue items from different groups with the same priority
    // The fairness algorithm should round-robin between groups
    await Promise.all([
      queue.enqueue({ type: "val", val: 100 }, { priority: 1, groupID: "A" }),
      queue.enqueue({ type: "val", val: 101 }, { priority: 1, groupID: "A" }),
      queue.enqueue({ type: "val", val: 102 }, { priority: 1, groupID: "A" }),
      queue.enqueue({ type: "val", val: 200 }, { priority: 1, groupID: "B" }),
      queue.enqueue({ type: "val", val: 201 }, { priority: 1, groupID: "B" }),
      queue.enqueue({ type: "val", val: 202 }, { priority: 1, groupID: "B" }),
      queue.enqueue({ type: "val", val: 300 }, { priority: 1, groupID: "C" }),
      queue.enqueue({ type: "val", val: 301 }, { priority: 1, groupID: "C" }),
      queue.enqueue({ type: "val", val: 302 }, { priority: 1, groupID: "C" }),
    ]);

    await waitUntilQueueEmpty();

    // All items should be processed
    expect(testState.results).toContain(100);
    expect(testState.results).toContain(101);
    expect(testState.results).toContain(102);
    expect(testState.results).toContain(200);
    expect(testState.results).toContain(201);
    expect(testState.results).toContain(202);
    expect(testState.results).toContain(300);
    expect(testState.results).toContain(301);
    expect(testState.results).toContain(302);

    // Verify fairness: items should be interleaved between groups
    // Due to fairness, we should not see all items from one group before another
    const groupAIndices = testState.results
      .map((v, i) => (v >= 100 && v < 200 ? i : -1))
      .filter((i) => i !== -1);
    const groupBIndices = testState.results
      .map((v, i) => (v >= 200 && v < 300 ? i : -1))
      .filter((i) => i !== -1);
    const groupCIndices = testState.results
      .map((v, i) => (v >= 300 && v < 400 ? i : -1))
      .filter((i) => i !== -1);

    // Check that groups are interleaved (no group should have all consecutive items)
    // The max index of any group should not be much earlier than min index of another
    const allIndices = [
      ...groupAIndices,
      ...groupBIndices,
      ...groupCIndices,
    ].sort((a, b) => a - b);

    expect(allIndices.length).toBe(9);
    // Verify that items are reasonably interleaved
    // (this is a heuristic check, not a strict guarantee)
    const maxGroupAIndex = Math.max(...groupAIndices);
    const minGroupBIndex = Math.min(...groupBIndices);
    const maxGroupBIndex = Math.max(...groupBIndices);
    const minGroupCIndex = Math.min(...groupCIndices);

    // Groups should overlap in their processing
    expect(maxGroupAIndex).toBeGreaterThan(minGroupBIndex);
    expect(maxGroupBIndex).toBeGreaterThan(minGroupCIndex);
  }, 90000);

  it("should prioritize higher priority items even with groupID fairness", async () => {
    // First, hog the queue
    await queue.enqueue({ type: "stall", durSec: 1 }, { priority: 0 });
    await queue.enqueue({ type: "stall", durSec: 1 }, { priority: 0 });
    await queue.enqueue({ type: "stall", durSec: 1 }, { priority: 0 });

    // Enqueue low priority items from group A
    await Promise.all([
      queue.enqueue({ type: "val", val: 100 }, { priority: 10, groupID: "A" }),
      queue.enqueue({ type: "val", val: 101 }, { priority: 10, groupID: "A" }),
      queue.enqueue({ type: "val", val: 102 }, { priority: 10, groupID: "A" }),
    ]);

    // Then enqueue high priority items from group B
    await Promise.all([
      queue.enqueue({ type: "val", val: 200 }, { priority: -5, groupID: "B" }),
      queue.enqueue({ type: "val", val: 201 }, { priority: -5, groupID: "B" }),
    ]);

    await waitUntilQueueEmpty();

    // High priority items should be processed before low priority items
    // regardless of groupID
    const highPriorityIndices = testState.results
      .map((v, i) => (v >= 200 && v < 300 ? i : -1))
      .filter((i) => i !== -1);
    const lowPriorityIndices = testState.results
      .map((v, i) => (v >= 100 && v < 200 ? i : -1))
      .filter((i) => i !== -1);

    const maxHighPriorityIndex = Math.max(...highPriorityIndices);
    const minLowPriorityIndex = Math.min(...lowPriorityIndices);

    // All high priority items should be processed before low priority items
    expect(maxHighPriorityIndex).toBeLessThan(minLowPriorityIndex);
  }, 90000);
});
