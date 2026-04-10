// Inspired from https://github.com/restatedev/examples/blob/main/typescript/patterns-use-cases/src/priorityqueue/queue.ts

import * as restate from "@restatedev/restate-sdk";
import {
  Context,
  object,
  ObjectContext,
  ObjectSharedContext,
} from "@restatedev/restate-sdk";
import { tryCatch } from "@karakeep/shared/tryCatch";

// --- Types ---

interface QueueItem {
  awakeable: string;
  idempotencyKey?: string;
  priority: number;
  leaseDurationMs: number;
}

interface PriorityQueueMeta {
  head: number;
  tail: number;
  count: number;
}

interface GroupMeta {
  bestPriority: number;
  lastServedTimestamp: number;
  totalItemCount: number;
  priorities: Record<number, PriorityQueueMeta>;
}

interface SemaphoreMetadata {
  paused: boolean;
  leases: Record<string, number>;
  groups: Record<string, GroupMeta>;
}

// Legacy types for migration
interface LegacyGroupState {
  id: string;
  items: QueueItem[];
  lastServedTimestamp: number;
}

// --- Key helpers ---

function itemKey(groupId: string, priority: number, slot: number): string {
  return `gq:${groupId}:${priority}:${slot}`;
}

function idemKey(key: string): string {
  return `idem:${key}`;
}

// --- State helpers ---

function newMetadata(): SemaphoreMetadata {
  return { paused: false, leases: {}, groups: {} };
}

async function getMetadata(
  ctx: ObjectContext | ObjectSharedContext,
): Promise<SemaphoreMetadata> {
  return (await ctx.get<SemaphoreMetadata>("metadata")) ?? newMetadata();
}

function setMetadata(ctx: ObjectContext, metadata: SemaphoreMetadata): void {
  ctx.set("metadata", metadata);
}

function computeBestPriority(
  priorities: Record<number, PriorityQueueMeta>,
): number {
  let best = Number.MAX_SAFE_INTEGER;
  for (const [p, meta] of Object.entries(priorities)) {
    if (meta.count > 0 && Number(p) < best) {
      best = Number(p);
    }
  }
  return best;
}

// --- Migration ---

async function migrateIfNeeded(ctx: ObjectContext): Promise<void> {
  const legacyGroups =
    await ctx.get<Record<string, LegacyGroupState>>("itemsv2");
  if (legacyGroups === null) {
    return;
  }

  const legacyLeases = (await ctx.get<Record<string, number>>("leases")) ?? {};
  const legacyPaused = (await ctx.get<boolean>("paused")) ?? false;

  const metadata: SemaphoreMetadata = {
    paused: legacyPaused,
    leases: legacyLeases,
    groups: {},
  };

  for (const [groupId, group] of Object.entries(legacyGroups)) {
    if (group.items.length === 0) continue;

    const priorities: Record<number, PriorityQueueMeta> = {};

    // Group items by priority, preserving insertion order within each priority
    const itemsByPriority: Record<number, QueueItem[]> = {};
    for (const item of group.items) {
      if (!itemsByPriority[item.priority]) {
        itemsByPriority[item.priority] = [];
      }
      itemsByPriority[item.priority].push(item);
    }

    for (const [p, items] of Object.entries(itemsByPriority)) {
      const priority = Number(p);
      priorities[priority] = {
        head: 0,
        tail: items.length,
        count: items.length,
      };
      for (let slot = 0; slot < items.length; slot++) {
        ctx.set(itemKey(groupId, priority, slot), items[slot]);
        if (items[slot].idempotencyKey) {
          ctx.set(idemKey(items[slot].idempotencyKey!), true);
        }
      }
    }

    metadata.groups[groupId] = {
      bestPriority: computeBestPriority(priorities),
      lastServedTimestamp: group.lastServedTimestamp,
      totalItemCount: group.items.length,
      priorities,
    };
  }

  setMetadata(ctx, metadata);

  // Clear legacy keys
  ctx.clear("itemsv2");
  ctx.clear("leases");
  ctx.clear("paused");
  ctx.clear("inFlight");
}

// --- Core scheduling ---

// Lower numbers represent higher priority, mirroring Liteque's semantics.
async function selectAndPopItem(
  ctx: ObjectContext,
  metadata: SemaphoreMetadata,
  now: number,
): Promise<{ item: QueueItem; groupId: string }> {
  // Phase 1: Pick the winning group from metadata
  let winnerGroupId = "";
  let winnerBestPriority = Number.MAX_SAFE_INTEGER;
  let winnerLastServed = Number.MAX_SAFE_INTEGER;

  for (const [groupId, group] of Object.entries(metadata.groups)) {
    if (group.totalItemCount === 0) continue;
    if (
      group.bestPriority < winnerBestPriority ||
      (group.bestPriority === winnerBestPriority &&
        group.lastServedTimestamp < winnerLastServed)
    ) {
      winnerGroupId = groupId;
      winnerBestPriority = group.bestPriority;
      winnerLastServed = group.lastServedTimestamp;
    }
  }

  const groupMeta = metadata.groups[winnerGroupId];
  const pqMeta = groupMeta.priorities[winnerBestPriority];

  // Phase 2: Load the head item from the winning priority queue
  const key = itemKey(winnerGroupId, winnerBestPriority, pqMeta.head);
  const item = await ctx.get<QueueItem>(key);
  if (item === null) {
    throw new restate.TerminalError(
      `Inconsistent state: item at ${key} not found`,
    );
  }
  ctx.clear(key);

  // Clean up idempotency key
  if (item.idempotencyKey) {
    ctx.clear(idemKey(item.idempotencyKey));
  }

  // Update metadata in-memory
  pqMeta.head++;
  pqMeta.count--;
  groupMeta.totalItemCount--;

  if (pqMeta.count === 0) {
    delete groupMeta.priorities[winnerBestPriority];
  }

  if (groupMeta.totalItemCount === 0) {
    delete metadata.groups[winnerGroupId];
  } else {
    groupMeta.bestPriority = computeBestPriority(groupMeta.priorities);
    groupMeta.lastServedTimestamp = now;
  }

  return { item, groupId: winnerGroupId };
}

function pruneExpiredLeases(metadata: SemaphoreMetadata, now: number): number {
  for (const [leaseId, expiry] of Object.entries(metadata.leases)) {
    if (expiry <= now) {
      delete metadata.leases[leaseId];
    }
  }
  return Object.keys(metadata.leases).length;
}

function hasItems(metadata: SemaphoreMetadata): boolean {
  return Object.keys(metadata.groups).length > 0;
}

async function tickUnlimited(
  ctx: ObjectContext,
  metadata: SemaphoreMetadata,
  count: number,
): Promise<void> {
  pruneExpiredLeases(metadata, await ctx.date.now());
  let dequeued = 0;
  while (!metadata.paused && dequeued < count && hasItems(metadata)) {
    const now = await ctx.date.now();
    const { item } = await selectAndPopItem(ctx, metadata, now);
    metadata.leases[item.awakeable] = now + item.leaseDurationMs;
    dequeued++;
    ctx.resolveAwakeable(item.awakeable);
  }
}

async function tick(
  ctx: ObjectContext,
  metadata: SemaphoreMetadata,
  capacity: number,
): Promise<void> {
  let activeLeases = pruneExpiredLeases(metadata, await ctx.date.now());
  while (!metadata.paused && activeLeases < capacity && hasItems(metadata)) {
    const now = await ctx.date.now();
    const { item } = await selectAndPopItem(ctx, metadata, now);
    metadata.leases[item.awakeable] = now + item.leaseDurationMs;
    activeLeases++;
    ctx.resolveAwakeable(item.awakeable);
  }
}

// --- Semaphore virtual object ---

export const semaphore = object({
  name: "Semaphore",
  handlers: {
    acquire: restate.handlers.object.exclusive(
      {
        ingressPrivate: true,
      },
      async (
        ctx: ObjectContext,
        req: {
          awakeableId: string;
          priority: number;
          capacity: number;
          leaseDurationMs: number;
          groupId?: string;
          idempotencyKey?: string;
        },
      ): Promise<boolean> => {
        await migrateIfNeeded(ctx);
        const metadata = await getMetadata(ctx);

        // Idempotency check
        if (req.idempotencyKey) {
          const exists = await ctx.get<boolean>(idemKey(req.idempotencyKey));
          if (exists) {
            return false;
          }
        }

        const groupId = req.groupId ?? "__ungrouped__";

        // Ensure group exists in metadata
        if (metadata.groups[groupId] === undefined) {
          metadata.groups[groupId] = {
            bestPriority: req.priority,
            lastServedTimestamp: await ctx.date.now(),
            totalItemCount: 0,
            priorities: {},
          };
        }

        const groupMeta = metadata.groups[groupId];

        // Ensure priority queue exists
        if (groupMeta.priorities[req.priority] === undefined) {
          groupMeta.priorities[req.priority] = {
            head: 0,
            tail: 0,
            count: 0,
          };
        }

        const pqMeta = groupMeta.priorities[req.priority];

        // Write item to its own state key
        const item: QueueItem = {
          awakeable: req.awakeableId,
          priority: req.priority,
          idempotencyKey: req.idempotencyKey,
          leaseDurationMs: req.leaseDurationMs,
        };
        ctx.set(itemKey(groupId, req.priority, pqMeta.tail), item);
        pqMeta.tail++;
        pqMeta.count++;

        // Update group metadata
        groupMeta.totalItemCount++;
        if (req.priority < groupMeta.bestPriority) {
          groupMeta.bestPriority = req.priority;
        }

        // Write idempotency key
        if (req.idempotencyKey) {
          ctx.set(idemKey(req.idempotencyKey), true);
        }

        await tick(ctx, metadata, req.capacity);

        setMetadata(ctx, metadata);
        return true;
      },
    ),

    release: restate.handlers.object.exclusive(
      {
        ingressPrivate: true,
      },
      async (
        ctx: ObjectContext,
        req: {
          leaseId: string;
          capacity: number;
        },
      ): Promise<void> => {
        await migrateIfNeeded(ctx);
        const metadata = await getMetadata(ctx);
        delete metadata.leases[req.leaseId];
        await tick(ctx, metadata, req.capacity);
        setMetadata(ctx, metadata);
      },
    ),

    pause: restate.handlers.object.exclusive(
      {},
      async (ctx: ObjectContext): Promise<void> => {
        await migrateIfNeeded(ctx);
        const metadata = await getMetadata(ctx);
        metadata.paused = true;
        setMetadata(ctx, metadata);
      },
    ),

    resume: restate.handlers.object.exclusive(
      {},
      async (ctx: ObjectContext): Promise<void> => {
        await migrateIfNeeded(ctx);
        const metadata = await getMetadata(ctx);
        metadata.paused = false;
        await tick(ctx, metadata, 1);
        setMetadata(ctx, metadata);
      },
    ),

    resetInflight: restate.handlers.object.exclusive(
      {},
      async (ctx: ObjectContext): Promise<void> => {
        await migrateIfNeeded(ctx);
        const metadata = await getMetadata(ctx);
        metadata.leases = {};
        setMetadata(ctx, metadata);
      },
    ),

    tick: restate.handlers.object.exclusive(
      {},
      async (ctx: ObjectContext, req?: { count?: number }): Promise<void> => {
        await migrateIfNeeded(ctx);
        const metadata = await getMetadata(ctx);
        await tickUnlimited(ctx, metadata, req?.count ?? 1);
        setMetadata(ctx, metadata);
      },
    ),

    forceReenqueue: restate.handlers.object.exclusive(
      {},
      async (ctx: ObjectContext, req?: { count?: number }): Promise<void> => {
        await migrateIfNeeded(ctx);
        const metadata = await getMetadata(ctx);
        let dequeued = 0;
        const count = req?.count ?? 1;
        while (dequeued < count && hasItems(metadata)) {
          const now = await ctx.date.now();
          const { item } = await selectAndPopItem(ctx, metadata, now);
          dequeued++;
          ctx.rejectAwakeable(item.awakeable, "Re-enqueue requested");
        }
        setMetadata(ctx, metadata);
      },
    ),

    reject: restate.handlers.object.exclusive(
      {},
      async (
        ctx: ObjectContext,
        req?: { count?: number; reason?: string },
      ): Promise<void> => {
        await migrateIfNeeded(ctx);
        const metadata = await getMetadata(ctx);
        let rejected = 0;
        const count = req?.count ?? 1;
        const reason = req?.reason ?? "Rejected";
        while (rejected < count && hasItems(metadata)) {
          const now = await ctx.date.now();
          const { item } = await selectAndPopItem(ctx, metadata, now);
          rejected++;
          ctx.rejectAwakeable(item.awakeable, reason);
        }
        setMetadata(ctx, metadata);
      },
    ),

    clearState: restate.handlers.object.exclusive(
      {},
      async (ctx: ObjectContext): Promise<void> => {
        ctx.clearAll();
      },
    ),

    clearGroupId: restate.handlers.object.exclusive(
      {},
      async (ctx: ObjectContext, req: { groupId: string }): Promise<void> => {
        await migrateIfNeeded(ctx);
        const metadata = await getMetadata(ctx);
        const groupMeta = metadata.groups[req.groupId];
        if (!groupMeta) {
          return;
        }

        // Clear all item keys and their idempotency keys
        for (const [p, pqMeta] of Object.entries(groupMeta.priorities)) {
          const priority = Number(p);
          for (let slot = pqMeta.head; slot < pqMeta.tail; slot++) {
            const key = itemKey(req.groupId, priority, slot);
            const item = await ctx.get<QueueItem>(key);
            ctx.clear(key);
            if (item?.idempotencyKey) {
              ctx.clear(idemKey(item.idempotencyKey));
            }
          }
        }

        delete metadata.groups[req.groupId];
        setMetadata(ctx, metadata);
      },
    ),

    queueSize: restate.handlers.object.shared(
      {},
      async (
        ctx: ObjectSharedContext,
      ): Promise<{
        pending: number;
        running: number;
      }> => {
        // Try new format first
        const metadata = await ctx.get<SemaphoreMetadata>("metadata");
        if (metadata) {
          let pending = 0;
          for (const group of Object.values(metadata.groups)) {
            pending += group.totalItemCount;
          }

          const now = Date.now();
          let running = 0;
          for (const expiry of Object.values(metadata.leases)) {
            if (expiry > now) {
              running++;
            }
          }
          return { pending, running };
        }

        // Fall back to legacy format
        const legacyGroups =
          await ctx.get<Record<string, LegacyGroupState>>("itemsv2");
        const legacyLeases = await ctx.get<Record<string, number>>("leases");

        let pending = 0;
        for (const group of Object.values(legacyGroups ?? {})) {
          pending += group.items.length;
        }

        const now = Date.now();
        let running = 0;
        for (const expiry of Object.values(legacyLeases ?? {})) {
          if (expiry > now) {
            running++;
          }
        }

        return { pending, running };
      },
    ),
  },
  options: {
    journalRetention: 0,
    enableLazyState: true,
  },
});

export const REENQUEUE_REASON = "Re-enqueue requested";

export class ReenqueueRequested extends Error {
  constructor() {
    super(REENQUEUE_REASON);
    this.name = "ReenqueueRequested";
  }
}

export class RestateSemaphore {
  constructor(
    private readonly ctx: Context,
    private readonly id: string,
    private readonly capacity: number,
    private readonly leaseDurationMs: number,
  ) {}

  async acquire(priority: number, groupId?: string, idempotencyKey?: string) {
    const awk = this.ctx.awakeable();
    const res = await this.ctx
      .objectClient<typeof semaphore>({ name: "Semaphore" }, this.id)
      .acquire({
        awakeableId: awk.id,
        priority,
        capacity: this.capacity,
        leaseDurationMs: this.leaseDurationMs,
        groupId,
        idempotencyKey,
      });

    if (!res) {
      return false;
    }

    const result = await tryCatch(awk.promise);
    if (result.error) {
      if (result.error instanceof restate.CancelledError) {
        await this.release(awk.id);
      }
      if (
        result.error instanceof restate.TerminalError &&
        result.error.message === REENQUEUE_REASON
      ) {
        throw new ReenqueueRequested();
      }
      throw result.error;
    }
    return awk.id;
  }
  async release(leaseId: string) {
    await this.ctx
      .objectClient<typeof semaphore>({ name: "Semaphore" }, this.id)
      .release({ leaseId, capacity: this.capacity });
  }
}
