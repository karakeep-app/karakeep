import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import type { webhooksTable } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import {
  zNewWebhookSchema,
  zUpdateWebhookSchema,
} from "@karakeep/shared/types/webhooks";

import type { Actor, Authorized } from "../lib/actor";
import { actorUserId, assertOwnership, authorize } from "../lib/actor";
import { WebhooksRepo } from "./webhooks.repo";

type Webhook = typeof webhooksTable.$inferSelect;

export class WebhooksService {
  private repo: WebhooksRepo;

  constructor(db: DB) {
    this.repo = new WebhooksRepo(db);
  }

  async get(actor: Actor, id: string): Promise<Authorized<Webhook>> {
    const webhook = await this.repo.get(id);
    if (!webhook) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Webhook not found",
      });
    }
    return authorize(webhook, () => assertOwnership(actor, webhook.userId));
  }

  async create(
    actor: Actor,
    input: z.infer<typeof zNewWebhookSchema>,
  ): Promise<Webhook> {
    const userId = actorUserId(actor);
    const webhookCount = await this.repo.countByUser(userId);
    const maxWebhooks = serverConfig.webhook.maxWebhooksPerUser;
    if (webhookCount >= maxWebhooks) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Maximum number of webhooks (${maxWebhooks}) reached`,
      });
    }

    return await this.repo.create(userId, input);
  }

  async update(
    webhook: Authorized<Webhook>,
    input: z.infer<typeof zUpdateWebhookSchema>,
  ): Promise<Webhook> {
    const updated = await this.repo.update(webhook.id, input);
    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return updated;
  }

  async getAll(actor: Actor): Promise<Webhook[]> {
    return await this.repo.getAll(actorUserId(actor));
  }

  async delete(webhook: Authorized<Webhook>): Promise<void> {
    const deleted = await this.repo.delete(webhook.id);
    if (!deleted) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
  }
}
