import { Context, object, ObjectContext } from "@restatedev/restate-sdk";

export const idProvider = object({
  name: "IdProvider",
  handlers: {
    get: async (ctx: ObjectContext<{ nextId: number }>): Promise<number> => {
      const state = (await ctx.get("nextId")) ?? 0;
      ctx.set("nextId", state + 1);
      return state;
    },
  },
  options: {
    ingressPrivate: true,
    journalRetention: 0,
  },
});

export async function genId(ctx: Context) {
  return ctx
    .objectClient<typeof idProvider>({ name: "IdProvider" }, "IdProvider")
    .get();
}
