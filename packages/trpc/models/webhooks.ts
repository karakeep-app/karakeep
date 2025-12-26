import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import { webhooksTable } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import {
  zNewWebhookSchema,
  zUpdateWebhookSchema,
  zWebhookSchema,
} from "@karakeep/shared/types/webhooks";

import { AuthedContext } from "..";
import { HasAccess, VerifiedResource } from "../lib/privacy";

/**
 * Privacy-safe Webhook model using VerifiedResource pattern.
 *
 * Webhooks are always owned by a single user (no sharing).
 * All verified webhooks have "owner" access level.
 */
export class Webhook extends VerifiedResource<
  typeof webhooksTable.$inferSelect,
  AuthedContext
> {
  protected constructor(
    ctx: AuthedContext,
    webhook: typeof webhooksTable.$inferSelect,
  ) {
    // Webhooks are always owner-only (no collaboration)
    super(ctx, webhook, "owner");
  }

  protected get webhook() {
    return this.data;
  }

  get id() {
    return this.webhook.id;
  }

  static async fromId(ctx: AuthedContext, id: string): Promise<Webhook> {
    const webhook = await ctx.db.query.webhooksTable.findFirst({
      where: eq(webhooksTable.id, id),
    });

    if (!webhook) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Webhook not found",
      });
    }

    // If it exists but belongs to another user, throw forbidden error
    if (webhook.userId !== ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to access resource",
      });
    }

    return new Webhook(ctx, webhook);
  }

  static async create(
    ctx: AuthedContext,
    input: z.infer<typeof zNewWebhookSchema>,
  ): Promise<Webhook> {
    // Check if user has reached the maximum number of webhooks
    const [webhookCount] = await ctx.db
      .select({ count: count() })
      .from(webhooksTable)
      .where(eq(webhooksTable.userId, ctx.user.id));

    const maxWebhooks = serverConfig.webhook.maxWebhooksPerUser;
    if (webhookCount.count >= maxWebhooks) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Maximum number of webhooks (${maxWebhooks}) reached`,
      });
    }

    const [result] = await ctx.db
      .insert(webhooksTable)
      .values({
        url: input.url,
        events: input.events,
        token: input.token ?? null,
        userId: ctx.user.id,
      })
      .returning();

    return new Webhook(ctx, result);
  }

  static async getAll(ctx: AuthedContext): Promise<Webhook[]> {
    const webhooks = await ctx.db.query.webhooksTable.findMany({
      where: eq(webhooksTable.userId, ctx.user.id),
    });

    return webhooks.map((w) => new Webhook(ctx, w));
  }

  /**
   * Delete this webhook.
   * TYPE CONSTRAINT: Requires owner access (always satisfied for webhooks).
   */
  async delete(this: Webhook & HasAccess<"owner">): Promise<void> {
    const res = await this.ctx.db
      .delete(webhooksTable)
      .where(
        and(
          eq(webhooksTable.id, this.webhook.id),
          eq(webhooksTable.userId, this.ctx.user.id),
        ),
      );

    if (res.changes === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
  }

  /**
   * Update this webhook.
   * TYPE CONSTRAINT: Requires owner access (always satisfied for webhooks).
   */
  async update(
    this: Webhook & HasAccess<"owner">,
    input: z.infer<typeof zUpdateWebhookSchema>,
  ): Promise<void> {
    const result = await this.ctx.db
      .update(webhooksTable)
      .set({
        url: input.url,
        events: input.events,
        token: input.token,
      })
      .where(
        and(
          eq(webhooksTable.id, this.webhook.id),
          eq(webhooksTable.userId, this.ctx.user.id),
        ),
      )
      .returning();

    if (result.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    // Update internal state - use Object.assign to preserve readonly
    Object.assign(this.data, result[0]);
  }

  asPublicWebhook(): z.infer<typeof zWebhookSchema> {
    const { token, ...rest } = this.webhook;
    return {
      ...rest,
      hasToken: token !== null,
    };
  }
}
