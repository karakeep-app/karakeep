// Inspired from https://github.com/restatedev/examples/blob/main/typescript/patterns-use-cases/src/priorityqueue/queue.ts

import * as restate from "@restatedev/restate-sdk";
import { Context, object, ObjectContext } from "@restatedev/restate-sdk";

interface QueueItem {
  awakeable: string;
  idempotencyKey?: string;
  priority: number;
}

interface LegacyQueueState {
  itemsv2: Record<string, GroupState>;
  inFlight: number;
  paused: boolean;
}

interface QueueState {
  groups: Record<string, GroupState>;
  inFlight: number;
  paused: boolean;
}

interface GroupState {
  id: string;
  items: QueueItem[];
  lastServedTimestamp: number;
}

export const semaphore = object({
  name: "Semaphore",
  handlers: {
    acquire: restate.handlers.object.exclusive(
      {
        ingressPrivate: true,
      },
      async (
        ctx: ObjectContext<LegacyQueueState>,
        req: {
          awakeableId: string;
          priority: number;
          capacity: number;
          groupId?: string;
          idempotencyKey?: string;
        },
      ): Promise<boolean> => {
        const state = await getState(ctx);

        if (
          req.idempotencyKey &&
          idempotencyKeyAlreadyExists(state.groups, req.idempotencyKey)
        ) {
          return false;
        }

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
          idempotencyKey: req.idempotencyKey,
        });

        tick(ctx, state, req.capacity);

        setState(ctx, state);
        return true;
      },
    ),

    release: restate.handlers.object.exclusive(
      {
        ingressPrivate: true,
      },
      async (
        ctx: ObjectContext<LegacyQueueState>,
        capacity: number,
      ): Promise<void> => {
        const state = await getState(ctx);
        state.inFlight--;
        tick(ctx, state, capacity);
        setState(ctx, state);
      },
    ),
    pause: restate.handlers.object.exclusive(
      {},
      async (ctx: ObjectContext<LegacyQueueState>): Promise<void> => {
        const state = await getState(ctx);
        state.paused = true;
        setState(ctx, state);
      },
    ),
    resume: restate.handlers.object.exclusive(
      {},
      async (ctx: ObjectContext<LegacyQueueState>): Promise<void> => {
        const state = await getState(ctx);
        state.paused = false;
        tick(ctx, state, 1);
        setState(ctx, state);
      },
    ),
    resetInflight: restate.handlers.object.exclusive(
      {},
      async (ctx: ObjectContext<LegacyQueueState>): Promise<void> => {
        const state = await getState(ctx);
        state.inFlight = 0;
        setState(ctx, state);
      },
    ),
    tick: restate.handlers.object.exclusive(
      {},
      async (ctx: ObjectContext<LegacyQueueState>): Promise<void> => {
        const state = await getState(ctx);
        tick(ctx, state, 1);
        setState(ctx, state);
      },
    ),
  },
  options: {
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
  while (
    !state.paused &&
    state.inFlight < capacity &&
    Object.keys(state.groups).length > 0
  ) {
    const { item } = selectAndPopItem(state);
    state.inFlight++;
    ctx.resolveAwakeable(item.awakeable);
  }
}

async function getState(
  ctx: ObjectContext<LegacyQueueState>,
): Promise<QueueState> {
  const groups = (await ctx.get("itemsv2")) ?? {};
  const paused = (await ctx.get("paused")) ?? false;

  return {
    groups,
    paused,
    inFlight: (await ctx.get("inFlight")) ?? 0,
  };
}

function idempotencyKeyAlreadyExists(
  items: Record<string, GroupState>,
  key: string,
) {
  for (const group of Object.values(items)) {
    if (group.items.some((item) => item.idempotencyKey === key)) {
      return true;
    }
  }
  return false;
}

function setState(ctx: ObjectContext<LegacyQueueState>, state: QueueState) {
  ctx.set("itemsv2", state.groups);
  ctx.set("inFlight", state.inFlight);
  ctx.set("paused", state.paused);
}

export class RestateSemaphore {
  constructor(
    private readonly ctx: Context,
    private readonly id: string,
    private readonly capacity: number,
  ) {}

  async acquire(priority: number, groupId?: string, idempotencyKey?: string) {
    const awk = this.ctx.awakeable();
    const res = await this.ctx
      .objectClient<typeof semaphore>({ name: "Semaphore" }, this.id)
      .acquire({
        awakeableId: awk.id,
        priority,
        capacity: this.capacity,
        groupId,
        idempotencyKey,
      });

    if (!res) {
      return false;
    }

    try {
      await awk.promise;
    } catch (e) {
      if (e instanceof restate.CancelledError) {
        await this.release();
        throw e;
      }
    }
    return true;
  }
  async release() {
    await this.ctx
      .objectClient<typeof semaphore>({ name: "Semaphore" }, this.id)
      .release(this.capacity);
  }
}
