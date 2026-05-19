import { experimental_trpcMiddleware } from "@trpc/server";
import { z } from "zod";

import { webhooksTable } from "@karakeep/db/schema";
import {
  zNewWebhookSchema,
  zUpdateWebhookSchema,
  zWebhookSchema,
} from "@karakeep/shared/types/webhooks";

import type { AuthedContext } from "../index";
import { createScopedAuthedProcedure, router } from "../index";
import { actorFromContext } from "../lib/actor";
import { WebhooksService } from "../models/webhooks.service";

function toPublicWebhook(webhook: typeof webhooksTable.$inferSelect) {
  const { token, ...rest } = webhook;
  return {
    ...rest,
    hasToken: token !== null,
  };
}

const webhooksProcedure = createScopedAuthedProcedure("webhooks").use(
  (opts) => {
    return opts.next({
      ctx: {
        ...opts.ctx,
        actor: actorFromContext(opts.ctx),
        webhooksService: new WebhooksService(opts.ctx.db),
      },
    });
  },
);

type WebhooksContext = AuthedContext & {
  actor: ReturnType<typeof actorFromContext>;
  webhooksService: WebhooksService;
};

const ensureWebhookOwnership = experimental_trpcMiddleware<{
  ctx: WebhooksContext;
  input: { webhookId: string };
}>().create(async (opts) => {
  const webhook = await opts.ctx.webhooksService.get(
    opts.ctx.actor,
    opts.input.webhookId,
  );

  return opts.next({
    ctx: {
      ...opts.ctx,
      webhook,
    },
  });
});

export const webhooksAppRouter = router({
  create: webhooksProcedure
    .input(zNewWebhookSchema)
    .output(zWebhookSchema)
    .mutation(async ({ input, ctx }) => {
      const webhook = await ctx.webhooksService.create(ctx.actor, input);
      return toPublicWebhook(webhook);
    }),
  update: webhooksProcedure
    .input(zUpdateWebhookSchema)
    .output(zWebhookSchema)
    .use(ensureWebhookOwnership)
    .mutation(async ({ input, ctx }) => {
      const updated = await ctx.webhooksService.update(ctx.webhook, input);
      return toPublicWebhook(updated);
    }),
  list: webhooksProcedure
    .output(z.object({ webhooks: z.array(zWebhookSchema) }))
    .query(async ({ ctx }) => {
      const webhooks = await ctx.webhooksService.getAll(ctx.actor);
      return { webhooks: webhooks.map(toPublicWebhook) };
    }),
  delete: webhooksProcedure
    .input(z.object({ webhookId: z.string() }))
    .use(ensureWebhookOwnership)
    .mutation(async ({ ctx }) => {
      await ctx.webhooksService.delete(ctx.webhook);
    }),
});
