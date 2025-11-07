// Inspired from https://github.com/restatedev/examples/blob/main/typescript/patterns-use-cases/src/priorityqueue/queue.ts

import { Context, object, ObjectContext } from "@restatedev/restate-sdk";

interface QueueItem {
  awakeable: string;
  priority: number;
}

interface QueueState {
  items: QueueItem[];
  inFlight: number;
}

export const semaphore = object({
  name: "Semaphore",
  handlers: {
    acquire: async (
      ctx: ObjectContext<QueueState>,
      req: { awakeableId: string; priority: number; capacity: number },
    ): Promise<void> => {
      const state = await getState(ctx);

      state.items.push({
        awakeable: req.awakeableId,
        priority: req.priority,
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

// Lower numbers represent higher priority, mirroring Liteque’s semantics.
function selectAndPopItem(items: QueueItem[]): QueueItem {
  let selected = { priority: Number.MAX_SAFE_INTEGER, index: 0 };
  for (const [i, item] of items.entries()) {
    if (item.priority < selected.priority) {
      selected.priority = item.priority;
      selected.index = i;
    }
  }
  const [item] = items.splice(selected.index, 1);
  return item;
}

function tick(
  ctx: ObjectContext<QueueState>,
  state: QueueState,
  capacity: number,
) {
  while (state.inFlight < capacity && state.items.length > 0) {
    const item = selectAndPopItem(state.items);
    state.inFlight++;
    ctx.resolveAwakeable(item.awakeable);
  }
}

async function getState(ctx: ObjectContext<QueueState>): Promise<QueueState> {
  return {
    items: (await ctx.get("items")) ?? [],
    inFlight: (await ctx.get("inFlight")) ?? 0,
  };
}

function setState(ctx: ObjectContext<QueueState>, state: QueueState) {
  ctx.set("items", state.items);
  ctx.set("inFlight", state.inFlight);
}

export class RestateSemaphore {
  constructor(
    private readonly ctx: Context,
    private readonly id: string,
    private readonly capacity: number,
  ) {}

  async acquire(priority: number) {
    const awk = this.ctx.awakeable();
    await this.ctx
      .objectClient<typeof semaphore>({ name: "Semaphore" }, this.id)
      .acquire({
        awakeableId: awk.id,
        priority,
        capacity: this.capacity,
      });
    await awk.promise;
  }
  async release() {
    await this.ctx
      .objectClient<typeof semaphore>({ name: "Semaphore" }, this.id)
      .release(this.capacity);
  }
}
