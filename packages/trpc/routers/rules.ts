import { experimental_trpcMiddleware, TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { bookmarkTags } from "@karakeep/db/schema";
import {
  RuleEngineRule,
  zNewRuleEngineRuleSchema,
  zRuleEngineRuleSchema,
  zUpdateRuleEngineRuleSchema,
} from "@karakeep/shared/types/rules";

import { AuthedContext, authedProcedure, router } from "../index";
import { List } from "../models/lists";
import { RuleEngineRuleModel } from "../models/rules";

const ensureRuleOwnership = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { id: string };
}>().create(async (opts) => {
  const rule = await RuleEngineRuleModel.fromId(opts.ctx, opts.input.id);
  return opts.next({
    ctx: {
      ...opts.ctx,
      rule,
    },
  });
});

const ensureTagListOwnership = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: Omit<RuleEngineRule, "id">;
}>().create(async (opts) => {
  const tagIds = [
    ...(opts.input.event.type === "tagAdded" ||
    opts.input.event.type === "tagRemoved"
      ? [opts.input.event.tagId]
      : []),
    ...(opts.input.condition.type === "hasTag"
      ? [opts.input.condition.tagId]
      : []),
    ...opts.input.actions.flatMap((a) =>
      a.type == "addTag" || a.type == "removeTag" ? [a.tagId] : [],
    ),
  ];

  const validateTags = async () => {
    if (tagIds.length == 0) {
      return;
    }
    const userTags = await opts.ctx.db.query.bookmarkTags.findMany({
      where: and(
        eq(bookmarkTags.userId, opts.ctx.user.id),
        inArray(bookmarkTags.id, tagIds),
      ),
      columns: {
        id: true,
      },
    });
    if (tagIds.some((t) => userTags.find((u) => u.id == t) == null)) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Tag not found",
      });
    }
  };

  const listIds = [
    ...(opts.input.event.type === "addedToList" ||
    opts.input.event.type === "removedFromList"
      ? [opts.input.event.listId]
      : []),
    ...opts.input.actions.flatMap((a) =>
      a.type == "addToList" || a.type == "removeFromList" ? [a.listId] : [],
    ),
  ];

  const [_tags, _lists] = await Promise.all([
    validateTags(),
    Promise.all(listIds.map((l) => List.fromId(opts.ctx, l))),
  ]);
  return opts.next();
});

export const rulesAppRouter = router({
  create: authedProcedure
    .input(zNewRuleEngineRuleSchema)
    .output(zRuleEngineRuleSchema)
    .use(ensureTagListOwnership)
    .mutation(async ({ input, ctx }) => {
      const newRule = await RuleEngineRuleModel.create(ctx, input);
      return newRule.rule;
    }),
  update: authedProcedure
    .input(zUpdateRuleEngineRuleSchema)
    .output(zRuleEngineRuleSchema)
    .use(ensureRuleOwnership)
    .use(ensureTagListOwnership)
    .mutation(async ({ ctx, input }) => {
      await ctx.rule.update(input);
      return ctx.rule.rule;
    }),
  delete: authedProcedure
    .input(z.object({ id: z.string() }))
    .use(ensureRuleOwnership)
    .mutation(async ({ ctx }) => {
      await ctx.rule.delete();
    }),
  list: authedProcedure
    .output(
      z.object({
        rules: z.array(zRuleEngineRuleSchema),
      }),
    )
    .query(async ({ ctx }) => {
      return {
        rules: (await RuleEngineRuleModel.getAll(ctx)).map((r) => r.rule),
      };
    }),
});
