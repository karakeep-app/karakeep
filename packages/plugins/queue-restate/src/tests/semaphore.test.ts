import * as restate from "@restatedev/restate-sdk";
import * as restateClient from "@restatedev/restate-sdk-clients";
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

import { AdminClient } from "../admin";
import { RestateSemaphore, semaphore } from "../semaphore";
import { waitUntil } from "./utils";

const SEMAPHORE_ID = "test-sem";
const CAPACITY = 3;
const LEASE_DURATION_MS = 5000;

/**
 * Minimal restate service that can call the ingressPrivate `acquire` handler
 * on behalf of the test via RestateSemaphore.
 */
const testHelper = restate.service({
  name: "TestHelper",
  handlers: {
    acquireAndHold: async (
      ctx: restate.Context,
      req: {
        priority: number;
        groupId?: string;
        idempotencyKey?: string;
        tag?: string;
      },
    ): Promise<{ leaseId: string; tag: string }> => {
      const sem = new RestateSemaphore(
        ctx,
        SEMAPHORE_ID,
        CAPACITY,
        LEASE_DURATION_MS,
      );
      const leaseId = await sem.acquire(
        req.priority,
        req.groupId,
        req.idempotencyKey,
      );
      if (!leaseId) {
        throw new Error("Failed to acquire semaphore");
      }
      return { leaseId, tag: req.tag ?? "" };
    },

    enqueue: async (
      ctx: restate.Context,
      req: {
        priority: number;
        groupId?: string;
        idempotencyKey?: string;
      },
    ): Promise<void> => {
      const awk = ctx.awakeable();
      // Await the acquire call to ensure the item is added to the queue,
      // but don't await awk.promise — the item stays pending.
      await ctx
        .objectClient<typeof semaphore>({ name: "Semaphore" }, SEMAPHORE_ID)
        .acquire({
          awakeableId: awk.id,
          priority: req.priority,
          capacity: CAPACITY,
          leaseDurationMs: LEASE_DURATION_MS,
          groupId: req.groupId,
          idempotencyKey: req.idempotencyKey,
        });
    },

    release: async (
      ctx: restate.Context,
      req: { leaseId: string },
    ): Promise<void> => {
      const sem = new RestateSemaphore(
        ctx,
        SEMAPHORE_ID,
        CAPACITY,
        LEASE_DURATION_MS,
      );
      await sem.release(req.leaseId);
    },
  },
});

describe("Semaphore handlers", () => {
  let adminClient: AdminClient;
  let ingress: restateClient.Ingress;
  let semClient: restateClient.IngressClient<
    restateClient.VirtualObject<typeof semaphore>
  >;
  let helperClient: restateClient.IngressClient<
    restateClient.Service<typeof testHelper>
  >;

  let activeLeases: string[];

  async function fillCapacity() {
    const promises = [];
    for (let i = 0; i < CAPACITY; i++) {
      promises.push(helperClient.acquireAndHold({ priority: -10 }));
    }
    const results = await Promise.all(promises);
    activeLeases = results.map((r) => r.leaseId);
  }

  async function releaseOne() {
    const leaseId = activeLeases.pop()!;
    await helperClient.release({ leaseId });
  }

  async function releaseAll() {
    await Promise.all(
      activeLeases.map((leaseId) => helperClient.release({ leaseId })),
    );
    activeLeases = [];
  }

  beforeEach(() => {
    activeLeases = [];
  });

  afterEach(async () => {
    if (activeLeases.length > 0) {
      await releaseAll();
    }
    await semClient.clearState();
  });

  beforeAll(async () => {
    const ingressPort = inject("restateIngressPort");
    const adminPort = inject("restateAdminPort");

    adminClient = new AdminClient(`http://localhost:${adminPort}`);

    const port = await restate.serve({
      port: 0,
      services: [semaphore, testHelper],
      logger: () => {
        /* quiet */
      },
    });

    await adminClient.upsertDeployment(`http://host.docker.internal:${port}`);

    ingress = restateClient.connect({
      url: `http://localhost:${ingressPort}`,
    });
    semClient = ingress.objectClient<typeof semaphore>(
      { name: "Semaphore" },
      SEMAPHORE_ID,
    );
    helperClient = ingress.serviceClient<typeof testHelper>({
      name: "TestHelper",
    });
  }, 90000);

  afterAll(async () => {
    // nothing to tear down — restate.serve doesn't return a handle
  });

  describe("acquire", () => {
    it("should grant lease immediately when capacity is available", async () => {
      const result = await helperClient.acquireAndHold({ priority: 0 });
      activeLeases.push(result.leaseId);

      expect(result.leaseId).toBeDefined();

      const size = await semClient.queueSize();
      expect(size.running).toBe(1);
      expect(size.pending).toBe(0);
    }, 60000);

    it("should enforce capacity limit", async () => {
      await fillCapacity();

      const size = await semClient.queueSize();
      expect(size.running).toBe(CAPACITY);

      // Next acquire should queue, not grant immediately
      await helperClient.enqueue({ priority: 0 });

      const sizeAfter = await semClient.queueSize();
      expect(sizeAfter.running).toBe(CAPACITY);
      expect(sizeAfter.pending).toBe(1);
    }, 60000);

    it("should reject duplicate idempotency keys", async () => {
      await fillCapacity();

      const key = `idem-${Date.now()}`;
      await helperClient.enqueue({ priority: 0, idempotencyKey: key });
      await helperClient.enqueue({ priority: 0, idempotencyKey: key });

      const size = await semClient.queueSize();
      // Only one item should be queued
      expect(size.pending).toBe(1);
    }, 60000);

    it("should respect priority ordering", async () => {
      await fillCapacity();

      // Enqueue items with different priorities (lower number = higher priority)
      const resolved: string[] = [];
      const pLow = helperClient
        .acquireAndHold({ priority: 2, tag: "low" })
        .then((r) => {
          resolved.push(r.tag);
          activeLeases.push(r.leaseId);
          return r;
        });
      const pHigh = helperClient
        .acquireAndHold({ priority: 0, tag: "high" })
        .then((r) => {
          resolved.push(r.tag);
          activeLeases.push(r.leaseId);
          return r;
        });
      const pMid = helperClient
        .acquireAndHold({ priority: 1, tag: "mid" })
        .then((r) => {
          resolved.push(r.tag);
          activeLeases.push(r.leaseId);
          return r;
        });

      // Wait for all to be enqueued
      await waitUntil(
        async () => (await semClient.queueSize()).pending === 3,
        "all items enqueued",
      );

      // Release slots one at a time — highest priority should resolve first
      await releaseOne();
      await waitUntil(async () => resolved.length === 1, "first item dequeued");
      expect(resolved[0]).toBe("high");

      await releaseOne();
      await waitUntil(
        async () => resolved.length === 2,
        "second item dequeued",
      );
      expect(resolved[1]).toBe("mid");

      await releaseOne();
      await waitUntil(async () => resolved.length === 3, "third item dequeued");
      expect(resolved[2]).toBe("low");

      await Promise.all([pLow, pHigh, pMid]);
    }, 60000);

    it("should enforce group fairness at same priority", async () => {
      await fillCapacity();

      const resolved: string[] = [];
      const track = (
        p: PromiseLike<{ leaseId: string; tag: string }>,
      ): PromiseLike<{ leaseId: string; tag: string }> =>
        p.then((r) => {
          resolved.push(r.tag);
          activeLeases.push(r.leaseId);
          return r;
        });

      // Enqueue one at a time to ensure deterministic group creation order
      const pA1 = track(
        helperClient.acquireAndHold({
          priority: 0,
          groupId: "A",
          tag: "A1",
        }),
      );
      await waitUntil(
        async () => (await semClient.queueSize()).pending === 1,
        "A1 enqueued",
      );

      const pA2 = track(
        helperClient.acquireAndHold({
          priority: 0,
          groupId: "A",
          tag: "A2",
        }),
      );
      await waitUntil(
        async () => (await semClient.queueSize()).pending === 2,
        "A2 enqueued",
      );

      const pB1 = track(
        helperClient.acquireAndHold({
          priority: 0,
          groupId: "B",
          tag: "B1",
        }),
      );
      await waitUntil(
        async () => (await semClient.queueSize()).pending === 3,
        "B1 enqueued",
      );

      // Release one at a time — A1 first (group A has earlier timestamp),
      // then B1 (group fairness), then A2
      await releaseOne();
      await waitUntil(async () => resolved.length === 1, "first item dequeued");
      expect(resolved[0]).toBe("A1");

      await releaseOne();
      await waitUntil(
        async () => resolved.length === 2,
        "second item dequeued",
      );
      expect(resolved[1]).toBe("B1");

      await releaseOne();
      await waitUntil(async () => resolved.length === 3, "third item dequeued");
      expect(resolved[2]).toBe("A2");

      await Promise.all([pA1, pA2, pB1]);
    }, 60000);
  });

  describe("release", () => {
    it("should free a slot and dequeue a pending item", async () => {
      await fillCapacity();

      const resolved: string[] = [];
      const pending = helperClient
        .acquireAndHold({ priority: 0, tag: "pending" })
        .then((r) => {
          resolved.push(r.tag);
          activeLeases.push(r.leaseId);
          return r;
        });

      await waitUntil(
        async () => (await semClient.queueSize()).pending === 1,
        "item enqueued",
      );

      // Release one slot — the pending item should be granted
      await releaseOne();

      await waitUntil(
        async () => resolved.length === 1,
        "pending item granted",
      );
      expect(resolved[0]).toBe("pending");

      const size = await semClient.queueSize();
      expect(size.running).toBe(CAPACITY);
      expect(size.pending).toBe(0);

      await pending;
    }, 60000);
  });

  describe("tick", () => {
    it("should dequeue one item by default", async () => {
      await fillCapacity();

      // Enqueue 3 more items that will be queued (capacity is full)
      await helperClient.enqueue({ priority: 0 });
      await helperClient.enqueue({ priority: 0 });
      await helperClient.enqueue({ priority: 0 });

      const sizeBefore = await semClient.queueSize();
      expect(sizeBefore.pending).toBe(3);
      expect(sizeBefore.running).toBe(CAPACITY);

      // Tick with default count — should dequeue 1 item beyond capacity
      await semClient.tick({});

      await waitUntil(async () => {
        const size = await semClient.queueSize();
        return size.pending === 2 && size.running === CAPACITY + 1;
      }, "tick to dequeue 1 item");
    }, 60000);

    it("should dequeue multiple items when count is specified", async () => {
      await fillCapacity();

      await helperClient.enqueue({ priority: 0 });
      await helperClient.enqueue({ priority: 0 });
      await helperClient.enqueue({ priority: 0 });

      // Tick with count=3
      await semClient.tick({ count: 3 });

      await waitUntil(async () => {
        const size = await semClient.queueSize();
        return size.pending === 0 && size.running === CAPACITY + 3;
      }, "tick to dequeue 3 items");
    }, 60000);
  });

  describe("forceReenqueue", () => {
    it("should remove item from queue and reject its awakeable", async () => {
      await fillCapacity();

      await helperClient.enqueue({ priority: 0, groupId: "g1" });
      await helperClient.enqueue({ priority: 0, groupId: "g2" });

      const sizeBefore = await semClient.queueSize();
      expect(sizeBefore.pending).toBe(2);

      await semClient.forceReenqueue({ count: 1 });

      const sizeAfter = await semClient.queueSize();
      expect(sizeAfter.pending).toBe(1);
    }, 60000);
  });

  describe("reject", () => {
    it("should remove items from queue", async () => {
      await fillCapacity();

      await helperClient.enqueue({ priority: 0 });
      await helperClient.enqueue({ priority: 0 });

      const sizeBefore = await semClient.queueSize();
      expect(sizeBefore.pending).toBe(2);

      await semClient.reject({ count: 1, reason: "Rejected by test" });

      const sizeAfter = await semClient.queueSize();
      expect(sizeAfter.pending).toBe(1);
    }, 60000);

    it("should reject multiple items", async () => {
      await fillCapacity();

      await helperClient.enqueue({ priority: 0 });
      await helperClient.enqueue({ priority: 0 });
      await helperClient.enqueue({ priority: 0 });

      await semClient.reject({ count: 3, reason: "Rejected" });

      const size = await semClient.queueSize();
      expect(size.pending).toBe(0);
    }, 60000);
  });

  describe("clearGroupId", () => {
    it("should remove all items in a specific group", async () => {
      await fillCapacity();

      await helperClient.enqueue({ priority: 0, groupId: "groupA" });
      await helperClient.enqueue({ priority: 0, groupId: "groupA" });
      await helperClient.enqueue({ priority: 0, groupId: "groupB" });

      const sizeBefore = await semClient.queueSize();
      expect(sizeBefore.pending).toBe(3);

      await semClient.clearGroupId({ groupId: "groupA" });

      const sizeAfter = await semClient.queueSize();
      // Only groupB item should remain
      expect(sizeAfter.pending).toBe(1);
    }, 60000);
  });

  describe("clearState", () => {
    it("should clear all semaphore state", async () => {
      await fillCapacity();

      await helperClient.enqueue({ priority: 0 });
      await helperClient.enqueue({ priority: 0 });

      await semClient.clearState();
      // Leases were cleared, so reset our tracking
      activeLeases = [];

      const size = await semClient.queueSize();
      expect(size.pending).toBe(0);
      expect(size.running).toBe(0);
    }, 60000);
  });

  describe("queueSize", () => {
    it("should report pending and running counts", async () => {
      await fillCapacity();

      await helperClient.enqueue({ priority: 0 });
      await helperClient.enqueue({ priority: 0 });

      const size = await semClient.queueSize();
      expect(size.running).toBe(CAPACITY);
      expect(size.pending).toBe(2);
    }, 60000);

    it("should report zero when empty", async () => {
      const size = await semClient.queueSize();
      expect(size.running).toBe(0);
      expect(size.pending).toBe(0);
    }, 60000);
  });

  describe("pause / resume", () => {
    it("should prevent tick from dequeuing when paused", async () => {
      await fillCapacity();

      await helperClient.enqueue({ priority: 0 });

      await semClient.pause();

      // Tick should not dequeue because paused (even though tickUnlimited ignores capacity)
      await semClient.tick({ count: 1 });

      const sizePaused = await semClient.queueSize();
      expect(sizePaused.pending).toBe(1);

      // Resume and then tick — should now dequeue
      await semClient.resume();
      await semClient.tick({ count: 1 });

      const sizeResumed = await semClient.queueSize();
      expect(sizeResumed.pending).toBe(0);
    }, 60000);
  });

  describe("resetInflight", () => {
    it("should clear all leases", async () => {
      await fillCapacity();

      const sizeBefore = await semClient.queueSize();
      expect(sizeBefore.running).toBe(CAPACITY);

      await semClient.resetInflight();
      // Leases were cleared, so reset our tracking
      activeLeases = [];

      const sizeAfter = await semClient.queueSize();
      expect(sizeAfter.running).toBe(0);
    }, 60000);
  });
});
