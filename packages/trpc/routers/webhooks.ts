import { experimental_trpcMiddleware, TRPCError } from "@trpc/server";
import { z } from "zod";

import { webhooksTable } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import {
  zNewWebhookSchema,
  zUpdateWebhookSchema,
  zWebhookSchema,
} from "@karakeep/shared/types/webhooks";

import type { AuthedContext } from "../index";
import { authedProcedure, router } from "../index";
import { WebhooksRepo } from "../models/webhooks.repo";

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
  const repo = new WebhooksRepo(opts.ctx.db);
  const webhook = await repo.get(opts.input.webhookId);

  if (!webhook) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Webhook not found",
    });
  }

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
      const repo = new WebhooksRepo(ctx.db);

      const webhookCount = await repo.countByUser(ctx.user.id);
      const maxWebhooks = serverConfig.webhook.maxWebhooksPerUser;
      if (webhookCount >= maxWebhooks) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Maximum number of webhooks (${maxWebhooks}) reached`,
        });
      }

      const webhook = await repo.create(ctx.user.id, input);
      return toPublicWebhook(webhook);
    }),
  update: authedProcedure
    .input(zUpdateWebhookSchema)
    .output(zWebhookSchema)
    .use(ensureWebhookOwnership)
    .mutation(async ({ input, ctx }) => {
      const repo = new WebhooksRepo(ctx.db);
      const updated = await repo.update(ctx.webhook.id, input);
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return toPublicWebhook(updated);
    }),
  list: authedProcedure
    .output(z.object({ webhooks: z.array(zWebhookSchema) }))
    .query(async ({ ctx }) => {
      const repo = new WebhooksRepo(ctx.db);
      const webhooks = await repo.getAll(ctx.user.id);
      return { webhooks: webhooks.map(toPublicWebhook) };
    }),
  delete: authedProcedure
    .input(z.object({ webhookId: z.string() }))
    .use(ensureWebhookOwnership)
    .mutation(async ({ ctx }) => {
      const repo = new WebhooksRepo(ctx.db);
      const deleted = await repo.delete(ctx.webhook.id);
      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
    }),
});
