import { experimental_trpcMiddleware } from "@trpc/server";
import { z } from "zod";

import {
  zNewWebhookSchema,
  zUpdateWebhookSchema,
  zWebhookSchema,
} from "@karakeep/shared/types/webhooks";

import type { AuthedContext } from "../index";
import { authedProcedure, router } from "../index";
import { Webhook } from "../models/webhooks";

export const ensureWebhookOwnership = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { webhookId: string };
}>().create(async (opts) => {
  const webhook = await Webhook.fromId(opts.ctx, opts.input.webhookId);
  return opts.next({
    ctx: {
      ...opts.ctx,
      webhook,
    },
  });
});

export const webhooksAppRouter = router({
  create: authedProcedure
    .input(zNewWebhookSchema)
    .output(zWebhookSchema)
    .mutation(async ({ input, ctx }) => {
      const webhook = await Webhook.create(ctx, input);
      return webhook.asPublicWebhook();
    }),
  update: authedProcedure
    .input(zUpdateWebhookSchema)
    .output(zWebhookSchema)
    .use(ensureWebhookOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.webhook.update(input);
      return ctx.webhook.asPublicWebhook();
    }),
  list: authedProcedure
    .output(z.object({ webhooks: z.array(zWebhookSchema) }))
    .query(async ({ ctx }) => {
      const webhooks = await Webhook.getAll(ctx);
      return { webhooks: webhooks.map((w) => w.asPublicWebhook()) };
    }),
  delete: authedProcedure
    .input(
      z.object({
        webhookId: z.string(),
      }),
    )
    .use(ensureWebhookOwnership)
    .mutation(async ({ ctx }) => {
      await ctx.webhook.delete();
    }),
});
