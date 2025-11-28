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

import { AdminClient } from "../admin";
import { RestateQueueProvider } from "../index";
import { waitUntil } from "./utils";

class Baton {
  private promise: Promise<void>;
  private resolve: () => void;
  private waiting = 0;

  constructor() {
    this.resolve = () => {
      /* empty */
    };
    this.promise = new Promise<void>((resolve) => {
      this.resolve = resolve;
    });
  }

  async acquire() {
    this.waiting++;
    await this.promise;
  }

  async waitUntilCountWaiting(count: number) {
    while (this.waiting < count) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  release() {
    this.resolve();
  }
}

type TestAction =
  | { type: "val"; val: number }
  | { type: "err"; err: string }
  | { type: "stall"; durSec: number }
  | { type: "semaphore-acquire" };

describe("Restate Queue Provider", () => {
  let queueClient: QueueClient;
  let queue: Queue<TestAction>;
  let adminClient: AdminClient;

  const testState = {
    results: [] as number[],
    errors: [] as string[],
    inFlight: 0,
    maxInFlight: 0,
    baton: new Baton(),
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
    testState.baton = new Baton();
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
            case "semaphore-acquire":
              await testState.baton.acquire();
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
    // hog the queue
    await Promise.all([
      queue.enqueue(
        { type: "semaphore-acquire" },
        { groupId: "init", priority: -10 },
      ),
      queue.enqueue(
        { type: "semaphore-acquire" },
        { groupId: "init", priority: -10 },
      ),
      queue.enqueue(
        { type: "semaphore-acquire" },
        { groupId: "init", priority: -10 },
      ),
    ]);
    await testState.baton.waitUntilCountWaiting(3);

    // Then those will get reprioritized
    await Promise.all([
      queue.enqueue({ type: "val", val: 200 }, { priority: -1 }),
      queue.enqueue({ type: "val", val: 201 }, { priority: -2 }),
      queue.enqueue({ type: "val", val: 202 }, { priority: -3 }),

      queue.enqueue({ type: "val", val: 300 }, { priority: 0 }),
      queue.enqueue({ type: "val", val: 301 }, { priority: 1 }),
      queue.enqueue({ type: "val", val: 302 }, { priority: 2 }),
    ]);

    // Wait for all jobs to be enqueued
    await new Promise((resolve) => setTimeout(resolve, 1000));
    testState.baton.release();

    await waitUntilQueueEmpty();

    expect(testState.results).toEqual([
      // Lower numeric priority value should run first
      202, 201, 200, 300, 301, 302,
    ]);
  }, 60000);

  describe("Group Fairness", () => {
    it("should process jobs from different groups fairly with same priority", async () => {
      // hog the queue
      await Promise.all([
        queue.enqueue(
          { type: "semaphore-acquire" },
          { groupId: "init", priority: -10 },
        ),
        queue.enqueue(
          { type: "semaphore-acquire" },
          { groupId: "init", priority: -10 },
        ),
        queue.enqueue(
          { type: "semaphore-acquire" },
          { groupId: "init", priority: -10 },
        ),
      ]);
      await testState.baton.waitUntilCountWaiting(3);

      // Enqueue jobs from two different groups with same priority
      // Group A has more jobs
      await queue.enqueue(
        { type: "val", val: 200 },
        { priority: 0, groupId: "B" },
      );
      await queue.enqueue(
        { type: "val", val: 201 },
        { priority: 0, groupId: "B" },
      );
      await queue.enqueue(
        { type: "val", val: 100 },
        { priority: 0, groupId: "A" },
      );
      await queue.enqueue(
        { type: "val", val: 101 },
        { priority: 0, groupId: "A" },
      );
      await queue.enqueue(
        { type: "val", val: 102 },
        { priority: 0, groupId: "A" },
      );
      await queue.enqueue(
        { type: "val", val: 103 },
        { priority: 0, groupId: "A" },
      );
      await queue.enqueue(
        { type: "val", val: 300 },
        { priority: 0, groupId: "C" },
      );
      await queue.enqueue(
        { type: "val", val: 301 },
        { priority: 0, groupId: "C" },
      );

      // Wait for all jobs to be enqueued
      await new Promise((resolve) => setTimeout(resolve, 1000));
      testState.baton.release();

      await waitUntilQueueEmpty();

      expect(testState.results).toEqual([
        200, 100, 300, 201, 101, 301, 102, 103,
      ]);
    }, 60000);

    it("should respect priority over group fairness", async () => {
      // hog the queue
      await Promise.all([
        queue.enqueue(
          { type: "semaphore-acquire" },
          { groupId: "init", priority: -10 },
        ),
        queue.enqueue(
          { type: "semaphore-acquire" },
          { groupId: "init", priority: -10 },
        ),
        queue.enqueue(
          { type: "semaphore-acquire" },
          { groupId: "init", priority: -10 },
        ),
      ]);
      await testState.baton.waitUntilCountWaiting(3);

      await queue.enqueue(
        { type: "val", val: 100 },
        { priority: 1, groupId: "A" },
      );
      await queue.enqueue(
        { type: "val", val: 101 },
        { priority: 1, groupId: "A" },
      );
      await queue.enqueue(
        { type: "val", val: 200 },
        { priority: 0, groupId: "B" },
      );
      await queue.enqueue(
        { type: "val", val: 201 },
        { priority: 0, groupId: "B" },
      );

      // Wait for all jobs to be enqueued
      await new Promise((resolve) => setTimeout(resolve, 1000));
      testState.baton.release();

      await waitUntilQueueEmpty();

      // Priority 0 (higher) should run before priority 1 (lower)
      expect(testState.results).toEqual([200, 201, 100, 101]);
    }, 60000);

    it("should handle jobs without groupId", async () => {
      // hog the queue
      await Promise.all([
        queue.enqueue(
          { type: "semaphore-acquire" },
          { groupId: "init", priority: -10 },
        ),
        queue.enqueue(
          { type: "semaphore-acquire" },
          { groupId: "init", priority: -10 },
        ),
        queue.enqueue(
          { type: "semaphore-acquire" },
          { groupId: "init", priority: -10 },
        ),
      ]);
      await testState.baton.waitUntilCountWaiting(3);

      // Mix of grouped and ungrouped jobs
      await queue.enqueue({ type: "val", val: 100 }, { priority: 0 }); // ungrouped
      await queue.enqueue({ type: "val", val: 101 }, { priority: 0 }); // ungrouped
      await queue.enqueue(
        { type: "val", val: 200 },
        { priority: 0, groupId: "A" },
      );
      await queue.enqueue(
        { type: "val", val: 201 },
        { priority: 0, groupId: "A" },
      );

      // Wait for all jobs to be enqueued
      await new Promise((resolve) => setTimeout(resolve, 1000));
      testState.baton.release();

      await waitUntilQueueEmpty();

      // All jobs should complete successfully
      expect(testState.results).toEqual([100, 200, 101, 201]);
    }, 60000);

    it("should work with jobs that don't specify groupId", async () => {
      // hog the queue
      await Promise.all([
        queue.enqueue(
          { type: "semaphore-acquire" },
          { groupId: "init", priority: -10 },
        ),
        queue.enqueue(
          { type: "semaphore-acquire" },
          { groupId: "init", priority: -10 },
        ),
        queue.enqueue(
          { type: "semaphore-acquire" },
          { groupId: "init", priority: -10 },
        ),
      ]);

      await testState.baton.waitUntilCountWaiting(3);

      // These should all go to the default "__ungrouped__" group
      await queue.enqueue({ type: "val", val: 1 }, { priority: 0 });
      await queue.enqueue({ type: "val", val: 2 }, { priority: 1 });
      await queue.enqueue({ type: "val", val: 3 }, { priority: -1 });

      // Wait for all jobs to be enqueued
      await new Promise((resolve) => setTimeout(resolve, 1000));

      testState.baton.release();

      await waitUntilQueueEmpty();

      // Should respect priority
      expect(testState.results).toEqual([3, 1, 2]);
    }, 60000);

    it("should handle same job in same group with different priorities", async () => {
      // hog the queue
      await Promise.all([
        queue.enqueue(
          { type: "semaphore-acquire" },
          { groupId: "init", priority: -10 },
        ),
        queue.enqueue(
          { type: "semaphore-acquire" },
          { groupId: "init", priority: -10 },
        ),
        queue.enqueue(
          { type: "semaphore-acquire" },
          { groupId: "init", priority: -10 },
        ),
      ]);
      await testState.baton.waitUntilCountWaiting(3);

      await queue.enqueue(
        { type: "val", val: 100 },
        { priority: 2, groupId: "A" },
      );
      await queue.enqueue(
        { type: "val", val: 101 },
        { priority: 1, groupId: "A" },
      );
      await queue.enqueue(
        { type: "val", val: 102 },
        { priority: 0, groupId: "A" },
      );

      // Wait for all jobs to be enqueued
      await new Promise((resolve) => setTimeout(resolve, 1000));
      testState.baton.release();

      await waitUntilQueueEmpty();

      // Should respect priority even within the same group
      expect(testState.results).toEqual([102, 101, 100]);
    }, 60000);
  });
});
