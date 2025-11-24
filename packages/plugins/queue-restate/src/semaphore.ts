// Inspired from https://github.com/restatedev/examples/blob/main/typescript/patterns-use-cases/src/priorityqueue/queue.ts

import * as restate from "@restatedev/restate-sdk";
import { Context, object, ObjectContext } from "@restatedev/restate-sdk";

interface QueueItem {
  awakeable: string;
  priority: number;
}

interface LegacyQueueState {
  items: QueueItem[];
  itemsv2: Record<string, GroupState>;
  inFlight: number;
}

interface QueueState {
  groups: Record<string, GroupState>;
  inFlight: number;
}

interface GroupState {
  id: string;
  items: QueueItem[];
  lastServedTimestamp: number;
}

export const semaphore = object({
  name: "Semaphore",
  handlers: {
    acquire: async (
      ctx: ObjectContext<LegacyQueueState>,
      req: {
        awakeableId: string;
        priority: number;
        capacity: number;
        groupId?: string;
      },
    ): Promise<void> => {
      const state = await getState(ctx);
      req.groupId = req.groupId ?? "__ungrouped__";

      if (state.groups[req.groupId] === undefined) {
        state.groups[req.groupId] = {
          id: req.groupId,
          items: [],
          lastServedTimestamp: Date.now(),
        };
      }

      state.groups[req.groupId].items.push({
        awakeable: req.awakeableId,
        priority: req.priority,
      });

      tick(ctx, state, req.capacity);

      setState(ctx, state);
    },

    release: async (
      ctx: ObjectContext<LegacyQueueState>,
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
    journalRetention: 0,
  },
});

// Lower numbers represent higher priority, mirroring Liteque’s semantics.
function selectAndPopItem(state: QueueState): {
  item: QueueItem;
  groupId: string;
} {
  let selected: {
    priority: number;
    groupId: string;
    index: number;
    groupLastServedTimestamp: number;
  } = {
    priority: Number.MAX_SAFE_INTEGER,
    groupId: "",
    index: 0,
    groupLastServedTimestamp: 0,
  };

  for (const [groupId, group] of Object.entries(state.groups)) {
    for (const [i, item] of group.items.entries()) {
      if (item.priority < selected.priority) {
        selected.priority = item.priority;
        selected.groupId = groupId;
        selected.index = i;
        selected.groupLastServedTimestamp = group.lastServedTimestamp;
      } else if (item.priority === selected.priority) {
        if (group.lastServedTimestamp < selected.groupLastServedTimestamp) {
          selected.priority = item.priority;
          selected.groupId = groupId;
          selected.index = i;
          selected.groupLastServedTimestamp = group.lastServedTimestamp;
        }
      }
    }
  }

  const [item] = state.groups[selected.groupId].items.splice(selected.index, 1);
  state.groups[selected.groupId].lastServedTimestamp = Date.now();
  if (state.groups[selected.groupId].items.length === 0) {
    delete state.groups[selected.groupId];
  }
  return { item, groupId: selected.groupId };
}

function tick(
  ctx: ObjectContext<LegacyQueueState>,
  state: QueueState,
  capacity: number,
) {
  while (state.inFlight < capacity && Object.keys(state.groups).length > 0) {
    const { item } = selectAndPopItem(state);
    state.inFlight++;
    ctx.resolveAwakeable(item.awakeable);
  }
}

async function getState(
  ctx: ObjectContext<LegacyQueueState>,
): Promise<QueueState> {
  const groups = (await ctx.get("itemsv2")) ?? {};
  const items = (await ctx.get("items")) ?? [];

  if (items.length > 0) {
    groups["__legacy__"] = {
      id: "__legacy__",
      items,
      lastServedTimestamp: 0,
    };
  }

  return {
    groups,
    inFlight: (await ctx.get("inFlight")) ?? 0,
  };
}

function setState(ctx: ObjectContext<LegacyQueueState>, state: QueueState) {
  ctx.set("itemsv2", state.groups);
  ctx.set("inFlight", state.inFlight);
  ctx.clear("items");
}

export class RestateSemaphore {
  constructor(
    private readonly ctx: Context,
    private readonly id: string,
    private readonly capacity: number,
  ) {}

  async acquire(priority: number, groupId?: string) {
    const awk = this.ctx.awakeable();
    await this.ctx
      .objectClient<typeof semaphore>({ name: "Semaphore" }, this.id)
      .acquire({
        awakeableId: awk.id,
        priority,
        capacity: this.capacity,
        groupId,
      });

    try {
      await awk.promise;
    } catch (e) {
      if (e instanceof restate.CancelledError) {
        await this.release();
        throw e;
      }
    }
  }
  async release() {
    await this.ctx
      .objectClient<typeof semaphore>({ name: "Semaphore" }, this.id)
      .release(this.capacity);
  }
}
