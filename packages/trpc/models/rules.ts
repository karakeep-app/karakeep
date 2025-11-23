import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db as DONT_USE_DB } from "@karakeep/db";
import {
  ruleEngineActionsTable,
  ruleEngineRulesTable,
} from "@karakeep/db/schema";
import {
  RuleEngineRule,
  zNewRuleEngineRuleSchema,
  zRuleEngineActionSchema,
  zRuleEngineConditionSchema,
  zRuleEngineEventSchema,
  zUpdateRuleEngineRuleSchema,
} from "@karakeep/shared/types/rules";

import { AuthedContext } from "..";

function dummy_fetchRule(ctx: AuthedContext, id: string) {
  return DONT_USE_DB.query.ruleEngineRulesTable.findFirst({
    where: and(
      eq(ruleEngineRulesTable.id, id),
      eq(ruleEngineRulesTable.userId, ctx.user.id),
    ),
    with: {
      actions: true, // Assuming actions are related; adjust if needed
    },
  });
}

type FetchedRuleType = NonNullable<Awaited<ReturnType<typeof dummy_fetchRule>>>;

export class RuleEngineRuleModel {
  protected constructor(
    protected ctx: AuthedContext,
    public rule: RuleEngineRule & { userId: string },
  ) {}

  private static fromData(
    ctx: AuthedContext,
    ruleData: FetchedRuleType,
  ): RuleEngineRuleModel {
    return new RuleEngineRuleModel(ctx, {
      id: ruleData.id,
      userId: ruleData.userId,
      name: ruleData.name,
      description: ruleData.description,
      enabled: ruleData.enabled,
      event: zRuleEngineEventSchema.parse(JSON.parse(ruleData.event)),
      condition: zRuleEngineConditionSchema.parse(
        JSON.parse(ruleData.condition),
      ),
      actions: ruleData.actions.map((a) =>
        zRuleEngineActionSchema.parse(JSON.parse(a.action)),
      ),
    });
  }

  static async fromId(
    ctx: AuthedContext,
    id: string,
  ): Promise<RuleEngineRuleModel> {
    const ruleData = await ctx.db.query.ruleEngineRulesTable.findFirst({
      where: and(
        eq(ruleEngineRulesTable.id, id),
        eq(ruleEngineRulesTable.userId, ctx.user.id),
      ),
      with: {
        actions: true, // Assuming actions are related; adjust if needed
      },
    });

    if (!ruleData) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Rule not found",
      });
    }

    return this.fromData(ctx, ruleData);
  }

  static async create(
    ctx: AuthedContext,
    input: z.infer<typeof zNewRuleEngineRuleSchema>,
  ): Promise<RuleEngineRuleModel> {
    // Similar to lists create, but for rules
    const insertedRule = await ctx.db.transaction(async (tx) => {
      const [newRule] = await tx
        .insert(ruleEngineRulesTable)
        .values({
          name: input.name,
          description: input.description,
          enabled: input.enabled,
          event: JSON.stringify(input.event),
          condition: JSON.stringify(input.condition),
          userId: ctx.user.id,
          listId:
            input.event.type === "addedToList" ||
            input.event.type === "removedFromList"
              ? input.event.listId
              : null,
          tagId:
            input.event.type === "tagAdded" || input.event.type === "tagRemoved"
              ? input.event.tagId
              : null,
        })
        .returning();

      if (input.actions.length > 0) {
        await tx.insert(ruleEngineActionsTable).values(
          input.actions.map((action) => ({
            ruleId: newRule.id,
            userId: ctx.user.id,
            action: JSON.stringify(action),
            listId:
              action.type === "addToList" || action.type === "removeFromList"
                ? action.listId
                : null,
            tagId:
              action.type === "addTag" || action.type === "removeTag"
                ? action.tagId
                : null,
          })),
        );
      }
      return newRule;
    });

    // Fetch the full rule after insertion
    return await RuleEngineRuleModel.fromId(ctx, insertedRule.id);
  }

  async update(
    input: z.infer<typeof zUpdateRuleEngineRuleSchema>,
  ): Promise<void> {
    if (this.rule.id !== input.id) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "ID mismatch" });
    }

    await this.ctx.db.transaction(async (tx) => {
      const result = await tx
        .update(ruleEngineRulesTable)
        .set({
          name: input.name,
          description: input.description,
          enabled: input.enabled,
          event: JSON.stringify(input.event),
          condition: JSON.stringify(input.condition),
          listId:
            input.event.type === "addedToList" ||
            input.event.type === "removedFromList"
              ? input.event.listId
              : null,
          tagId:
            input.event.type === "tagAdded" || input.event.type === "tagRemoved"
              ? input.event.tagId
              : null,
        })
        .where(
          and(
            eq(ruleEngineRulesTable.id, input.id),
            eq(ruleEngineRulesTable.userId, this.ctx.user.id),
          ),
        );

      if (result.changes === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
      }

      if (input.actions.length > 0) {
        await tx
          .delete(ruleEngineActionsTable)
          .where(eq(ruleEngineActionsTable.ruleId, input.id));
        await tx.insert(ruleEngineActionsTable).values(
          input.actions.map((action) => ({
            ruleId: input.id,
            userId: this.ctx.user.id,
            action: JSON.stringify(action),
            listId:
              action.type === "addToList" || action.type === "removeFromList"
                ? action.listId
                : null,
            tagId:
              action.type === "addTag" || action.type === "removeTag"
                ? action.tagId
                : null,
          })),
        );
      }
    });

    this.rule = await RuleEngineRuleModel.fromId(this.ctx, this.rule.id).then(
      (r) => r.rule,
    );
  }

  async delete(): Promise<void> {
    const result = await this.ctx.db
      .delete(ruleEngineRulesTable)
      .where(
        and(
          eq(ruleEngineRulesTable.id, this.rule.id),
          eq(ruleEngineRulesTable.userId, this.ctx.user.id),
        ),
      );

    if (result.changes === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
    }
  }

  static async getAll(ctx: AuthedContext): Promise<RuleEngineRuleModel[]> {
    const rulesData = await ctx.db.query.ruleEngineRulesTable.findMany({
      where: eq(ruleEngineRulesTable.userId, ctx.user.id),
      with: { actions: true },
    });

    return rulesData.map((r) => this.fromData(ctx, r));
  }
}
