// Inspired from https://github.com/restatedev/examples/blob/main/typescript/patterns-use-cases/src/priorityqueue/queue.ts

import { Context, object, ObjectContext } from "@restatedev/restate-sdk";

interface QueueItem {
  awakeable: string;
  priority: number;
  groupID?: string;
}

interface QueueState {
  // Old schema (deprecated, for backward compatibility)
  items?: QueueItem[];
  lastServedGroups?: string[];

  // New schema
  groupQueues?: Record<string, QueueItem[]>;
  ungroupedQueue?: QueueItem[];
  inFlight: number;
  lastServedGroup?: string;
}

export const semaphore = object({
  name: "Semaphore",
  handlers: {
    acquire: async (
      ctx: ObjectContext<QueueState>,
      req: {
        awakeableId: string;
        priority: number;
        capacity: number;
        groupID?: string;
      },
    ): Promise<void> => {
      const state = await getState(ctx);

      const item: QueueItem = {
        awakeable: req.awakeableId,
        priority: req.priority,
        groupID: req.groupID,
      };

      // Add to appropriate queue
      if (req.groupID) {
        if (!state.groupQueues![req.groupID]) {
          state.groupQueues![req.groupID] = [];
        }
        state.groupQueues![req.groupID].push(item);
      } else {
        state.ungroupedQueue!.push(item);
      }

      tick(ctx, state, req.capacity);

      setState(ctx, state);
    },

    release: async (
      ctx: ObjectContext<QueueState>,
      capacity: number,
    ): Promise<void> => {
      const state = await getState(ctx);
      state.inFlight--;
      tick(ctx, state, capacity);
      setState(ctx, state);
    },
  },
  options: {
    ingressPrivate: true,
  },
});

// Lower numbers represent higher priority, mirroring Liteque's semantics.
// Within the same priority, we implement round-robin fairness across groups.
function selectAndPopItem(state: QueueState): QueueItem {
  interface QueueHead {
    groupID: string | null;
    priority: number;
    queue: QueueItem[];
  }

  // Collect all non-empty queue heads
  const queueHeads: QueueHead[] = [];

  // Add ungrouped queue
  if (state.ungroupedQueue!.length > 0) {
    queueHeads.push({
      groupID: null,
      priority: state.ungroupedQueue![0].priority,
      queue: state.ungroupedQueue!,
    });
  }

  // Add all group queues
  for (const [groupID, queue] of Object.entries(state.groupQueues!)) {
    if (queue.length > 0) {
      queueHeads.push({
        groupID,
        priority: queue[0].priority,
        queue,
      });
    }
  }

  if (queueHeads.length === 0) {
    throw new Error("No items in queue");
  }

  // Find the highest priority (lowest number)
  const highestPriority = Math.min(...queueHeads.map((h) => h.priority));

  // Filter to only queues with the highest priority
  const highPriorityQueues = queueHeads.filter(
    (h) => h.priority === highestPriority,
  );

  // Among high priority queues, prefer one that wasn't just served
  let selectedQueue: QueueHead | undefined;

  // First, try to find a queue whose group wasn't just served
  selectedQueue = highPriorityQueues.find(
    (h) => h.groupID !== state.lastServedGroup,
  );

  // If all were just served, pick the first one (round-robin will happen naturally)
  if (!selectedQueue) {
    selectedQueue = highPriorityQueues[0];
  }

  // Pop and return the first item from the selected queue
  const item = selectedQueue.queue.shift()!;

  // Clean up empty group queues to avoid memory leaks
  if (selectedQueue.groupID && selectedQueue.queue.length === 0) {
    delete state.groupQueues![selectedQueue.groupID];
  }

  return item;
}

function tick(
  ctx: ObjectContext<QueueState>,
  state: QueueState,
  capacity: number,
) {
  while (state.inFlight < capacity && hasItems(state)) {
    const item = selectAndPopItem(state);
    state.inFlight++;

    // Track the served group for fairness
    state.lastServedGroup = item.groupID;

    ctx.resolveAwakeable(item.awakeable);
  }
}

function hasItems(state: QueueState): boolean {
  if (state.ungroupedQueue!.length > 0) {
    return true;
  }
  for (const queue of Object.values(state.groupQueues!)) {
    if (queue.length > 0) {
      return true;
    }
  }
  return false;
}

async function getState(ctx: ObjectContext<QueueState>): Promise<QueueState> {
  const inFlight = (await ctx.get("inFlight")) ?? 0;

  // Check if we have old schema data
  const oldItems = await ctx.get("items");

  if (oldItems && oldItems.length > 0) {
    // Migrate old schema to new schema
    const groupQueues: Record<string, QueueItem[]> = {};
    const ungroupedQueue: QueueItem[] = [];

    for (const item of oldItems) {
      if (item.groupID) {
        if (!groupQueues[item.groupID]) {
          groupQueues[item.groupID] = [];
        }
        groupQueues[item.groupID].push(item);
      } else {
        ungroupedQueue.push(item);
      }
    }

    return {
      groupQueues,
      ungroupedQueue,
      inFlight,
      lastServedGroup: undefined,
    };
  }

  // Use new schema
  return {
    groupQueues: (await ctx.get("groupQueues")) ?? {},
    ungroupedQueue: (await ctx.get("ungroupedQueue")) ?? [],
    inFlight,
    lastServedGroup: await ctx.get("lastServedGroup"),
  };
}

function setState(ctx: ObjectContext<QueueState>, state: QueueState) {
  // Only write new schema
  ctx.set("groupQueues", state.groupQueues);
  ctx.set("ungroupedQueue", state.ungroupedQueue);
  ctx.set("inFlight", state.inFlight);
  ctx.set("lastServedGroup", state.lastServedGroup);

  // Clear old schema if it exists (for migration)
  ctx.clear("items");
  ctx.clear("lastServedGroups");
}

export class RestateSemaphore {
  constructor(
    private readonly ctx: Context,
    private readonly id: string,
    private readonly capacity: number,
  ) {}

  async acquire(priority: number, groupID?: string) {
    const awk = this.ctx.awakeable();
    await this.ctx
      .objectClient<typeof semaphore>({ name: "Semaphore" }, this.id)
      .acquire({
        awakeableId: awk.id,
        priority,
        capacity: this.capacity,
        groupID,
      });
    await awk.promise;
  }
  async release() {
    await this.ctx
      .objectClient<typeof semaphore>({ name: "Semaphore" }, this.id)
      .release(this.capacity);
  }
}
