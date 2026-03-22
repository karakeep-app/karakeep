import { experimental_trpcMiddleware } from "@trpc/server";
import { z } from "zod";

import { webhooksTable } from "@karakeep/db/schema";
import {
  zNewWebhookSchema,
  zUpdateWebhookSchema,
  zWebhookSchema,
} from "@karakeep/shared/types/webhooks";

import type { AuthedContext } from "../index";
import { authedProcedure, router } from "../index";
import { actorFromContext } from "../lib/actor";
import { WebhooksService } from "../models/webhooks.service";

function toPublicWebhook(webhook: typeof webhooksTable.$inferSelect) {
  const { token, ...rest } = webhook;
  return {
    ...rest,
    hasToken: token !== null,
  };
}

const ensureWebhookOwnership = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { webhookId: string };
}>().create(async (opts) => {
  const service = new WebhooksService(opts.ctx.db);
  const actor = actorFromContext(opts.ctx);
  const webhook = await service.get(actor, opts.input.webhookId);

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
      const service = new WebhooksService(ctx.db);
      const actor = actorFromContext(ctx);
      const webhook = await service.create(actor, input);
      return toPublicWebhook(webhook);
    }),
  update: authedProcedure
    .input(zUpdateWebhookSchema)
    .output(zWebhookSchema)
    .use(ensureWebhookOwnership)
    .mutation(async ({ input, ctx }) => {
      const service = new WebhooksService(ctx.db);
      const updated = await service.update(ctx.webhook, input);
      return toPublicWebhook(updated);
    }),
  list: authedProcedure
    .output(z.object({ webhooks: z.array(zWebhookSchema) }))
    .query(async ({ ctx }) => {
      const service = new WebhooksService(ctx.db);
      const actor = actorFromContext(ctx);
      const webhooks = await service.getAll(actor);
      return { webhooks: webhooks.map(toPublicWebhook) };
    }),
  delete: authedProcedure
    .input(z.object({ webhookId: z.string() }))
    .use(ensureWebhookOwnership)
    .mutation(async ({ ctx }) => {
      const service = new WebhooksService(ctx.db);
      await service.delete(ctx.webhook);
    }),
});
