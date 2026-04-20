import { count, eq } from "drizzle-orm";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import { webhooksTable } from "@karakeep/db/schema";
import {
  zNewWebhookSchema,
  zUpdateWebhookSchema,
} from "@karakeep/shared/types/webhooks";

type Webhook = typeof webhooksTable.$inferSelect;

export class WebhooksRepo {
  constructor(private db: DB) {}

  async get(id: string): Promise<Webhook | null> {
    const webhook = await this.db.query.webhooksTable.findFirst({
      where: eq(webhooksTable.id, id),
    });
    return webhook ?? null;
  }

  async create(
    userId: string,
    input: z.infer<typeof zNewWebhookSchema>,
  ): Promise<Webhook> {
    const [result] = await this.db
      .insert(webhooksTable)
      .values({
        url: input.url,
        events: input.events,
        token: input.token ?? null,
        userId,
      })
      .returning();

    return result;
  }

  async countByUser(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(webhooksTable)
      .where(eq(webhooksTable.userId, userId));
    return result.count;
  }

  async getAll(userId: string): Promise<Webhook[]> {
    return await this.db.query.webhooksTable.findMany({
      where: eq(webhooksTable.userId, userId),
    });
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db
      .delete(webhooksTable)
      .where(eq(webhooksTable.id, id));
    return res.changes > 0;
  }

  async update(
    id: string,
    input: z.infer<typeof zUpdateWebhookSchema>,
  ): Promise<Webhook | null> {
    const result = await this.db
      .update(webhooksTable)
      .set({
        url: input.url,
        events: input.events,
        token: input.token,
      })
      .where(eq(webhooksTable.id, id))
      .returning();

    return result[0] ?? null;
  }
}
