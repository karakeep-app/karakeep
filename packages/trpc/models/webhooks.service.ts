import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import type { webhooksTable } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import {
  zNewWebhookSchema,
  zUpdateWebhookSchema,
} from "@karakeep/shared/types/webhooks";

import { WebhooksRepo } from "./webhooks.repo";

type Webhook = typeof webhooksTable.$inferSelect;

export class WebhooksService {
  private repo: WebhooksRepo;

  constructor(db: DB) {
    this.repo = new WebhooksRepo(db);
  }

  async get(id: string): Promise<Webhook> {
    const webhook = await this.repo.get(id);
    if (!webhook) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Webhook not found",
      });
    }
    return webhook;
  }

  async create(
    userId: string,
    input: z.infer<typeof zNewWebhookSchema>,
  ): Promise<Webhook> {
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
    id: string,
    input: z.infer<typeof zUpdateWebhookSchema>,
  ): Promise<Webhook> {
    const updated = await this.repo.update(id, input);
    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return updated;
  }

  async getAll(userId: string): Promise<Webhook[]> {
    return await this.repo.getAll(userId);
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
  }
}
