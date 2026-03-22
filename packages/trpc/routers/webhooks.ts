import { experimental_trpcMiddleware, TRPCError } from "@trpc/server";
import { z } from "zod";

import { webhooksTable } from "@karakeep/db/schema";
import {
  zNewWebhookSchema,
  zUpdateWebhookSchema,
  zWebhookSchema,
} from "@karakeep/shared/types/webhooks";

import type { AuthedContext } from "../index";
import { authedProcedure, router } from "../index";
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
  const webhook = await service.get(opts.input.webhookId);

  if (webhook.userId !== opts.ctx.user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "User is not allowed to access resource",
    });
  }

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
      const webhook = await service.create(ctx.user.id, input);
      return toPublicWebhook(webhook);
    }),
  update: authedProcedure
    .input(zUpdateWebhookSchema)
    .output(zWebhookSchema)
    .use(ensureWebhookOwnership)
    .mutation(async ({ input, ctx }) => {
      const service = new WebhooksService(ctx.db);
      const updated = await service.update(ctx.webhook.id, input);
      return toPublicWebhook(updated);
    }),
  list: authedProcedure
    .output(z.object({ webhooks: z.array(zWebhookSchema) }))
    .query(async ({ ctx }) => {
      const service = new WebhooksService(ctx.db);
      const webhooks = await service.getAll(ctx.user.id);
      return { webhooks: webhooks.map(toPublicWebhook) };
    }),
  delete: authedProcedure
    .input(z.object({ webhookId: z.string() }))
    .use(ensureWebhookOwnership)
    .mutation(async ({ ctx }) => {
      const service = new WebhooksService(ctx.db);
      await service.delete(ctx.webhook.id);
    }),
});
