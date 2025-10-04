import { Context, object, ObjectContext } from "@restatedev/restate-sdk";

interface QueueState {
  awakeables: string[];
  available: number;
}

export const semaphore = object({
  name: "semaphore",
  handlers: {
    acquire: async (
      ctx: ObjectContext<QueueState>,
      req: { awkableId: string; capacity: number },
    ): Promise<void> => {
      const state = await getState(ctx, req.capacity);
      if (state.available > 0) {
        state.available--;
        ctx.resolveAwakeable(req.awkableId);
        setState(ctx, state);
        return;
      }

      state.awakeables.push(req.awkableId);
      setState(ctx, state);
    },

    release: async (
      ctx: ObjectContext<QueueState>,
      capacity: number,
    ): Promise<void> => {
      const state = await getState(ctx, capacity);

      if (state.awakeables.length === 0) {
        state.available++;
        setState(ctx, state);
        return;
      }

      const id = state.awakeables.shift()!;
      ctx.resolveAwakeable(id);
      setState(ctx, state);
    },
  },
});

async function getState(
  ctx: ObjectContext<QueueState>,
  capacity: number,
): Promise<QueueState> {
  return {
    awakeables: (await ctx.get("awakeables")) ?? [],
    available: (await ctx.get("available")) ?? capacity,
  };
}

function setState(ctx: ObjectContext<QueueState>, state: QueueState) {
  ctx.set("awakeables", state.awakeables);
  ctx.set("available", state.available);
}

export class RestateSemaphore {
  constructor(
    private ctx: Context,
    private id: string,
    private capacity: number,
  ) {}

  async acquire() {
    const awk = this.ctx.awakeable();
    await this.ctx
      .objectClient<typeof semaphore>({ name: "semaphore" }, this.id)
      .acquire({
        awkableId: awk.id,
        capacity: this.capacity,
      });
    await awk.promise;
  }
  async release() {
    await this.ctx
      .objectClient<typeof semaphore>({ name: "semaphore" }, this.id)
      .release(this.capacity);
  }
}
