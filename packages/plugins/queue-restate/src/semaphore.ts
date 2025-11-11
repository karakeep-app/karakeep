// Inspired from https://github.com/restatedev/examples/blob/main/typescript/patterns-use-cases/src/priorityqueue/queue.ts

import { Context, object, ObjectContext } from "@restatedev/restate-sdk";

interface QueueItem {
  awakeable: string;
  priority: number;
  groupID?: string;
}

interface QueueState {
  items: QueueItem[];
  inFlight: number;
  lastServedGroups: string[];
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

      state.items.push({
        awakeable: req.awakeableId,
        priority: req.priority,
        groupID: req.groupID,
      });

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
// Within the same priority, we implement fairness across groups.
function selectAndPopItem(
  items: QueueItem[],
  lastServedGroups: string[],
): QueueItem {
  // Find the highest priority (lowest number)
  let highestPriority = Number.MAX_SAFE_INTEGER;
  for (const item of items) {
    if (item.priority < highestPriority) {
      highestPriority = item.priority;
    }
  }

  // Filter to only items with the highest priority
  const highPriorityItems: Array<{ item: QueueItem; index: number }> = [];
  for (const [i, item] of items.entries()) {
    if (item.priority === highestPriority) {
      highPriorityItems.push({ item, index: i });
    }
  }

  // If there's only one high priority item, select it
  if (highPriorityItems.length === 1) {
    const [item] = items.splice(highPriorityItems[0].index, 1);
    return item;
  }

  // Among high priority items, implement fairness across groups
  // Find items whose group was not recently served
  let selectedIndex = -1;

  // First, try to find an item from a group that hasn't been served recently
  for (const { item, index } of highPriorityItems) {
    const groupID = item.groupID;
    // Items without groupID are always considered fair to select
    if (!groupID || !lastServedGroups.includes(groupID)) {
      selectedIndex = index;
      break;
    }
  }

  // If all groups were recently served, pick the one served longest ago
  if (selectedIndex === -1) {
    let oldestServedIndex = Infinity;
    for (const { item, index } of highPriorityItems) {
      const groupID = item.groupID;
      if (!groupID) {
        // Items without groupID can be selected
        selectedIndex = index;
        break;
      }
      const lastServedIndex = lastServedGroups.indexOf(groupID);
      if (lastServedIndex !== -1 && lastServedIndex < oldestServedIndex) {
        oldestServedIndex = lastServedIndex;
        selectedIndex = index;
      }
    }
  }

  // Fallback: if we still haven't selected an item, pick the first one
  if (selectedIndex === -1) {
    selectedIndex = highPriorityItems[0].index;
  }

  const [item] = items.splice(selectedIndex, 1);
  return item;
}

function tick(
  ctx: ObjectContext<QueueState>,
  state: QueueState,
  capacity: number,
) {
  while (state.inFlight < capacity && state.items.length > 0) {
    const item = selectAndPopItem(state.items, state.lastServedGroups);
    state.inFlight++;

    // Track the served group for fairness (only if groupID is present)
    if (item.groupID) {
      // Add to the front of the history
      state.lastServedGroups.unshift(item.groupID);
      // Keep only the last 100 served groups to avoid unbounded growth
      if (state.lastServedGroups.length > 100) {
        state.lastServedGroups = state.lastServedGroups.slice(0, 100);
      }
    }

    ctx.resolveAwakeable(item.awakeable);
  }
}

async function getState(ctx: ObjectContext<QueueState>): Promise<QueueState> {
  return {
    items: (await ctx.get("items")) ?? [],
    inFlight: (await ctx.get("inFlight")) ?? 0,
    lastServedGroups: (await ctx.get("lastServedGroups")) ?? [],
  };
}

function setState(ctx: ObjectContext<QueueState>, state: QueueState) {
  ctx.set("items", state.items);
  ctx.set("inFlight", state.inFlight);
  ctx.set("lastServedGroups", state.lastServedGroups);
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
