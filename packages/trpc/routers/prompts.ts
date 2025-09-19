import { experimental_trpcMiddleware, TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { customPrompts } from "@karakeep/db/schema";
import {
  zNewPromptSchema,
  zPromptSchema,
  zUpdatePromptSchema,
} from "@karakeep/shared/types/prompts";

import { authedProcedure, Context, router } from "../index";

export const ensurePromptOwnership = experimental_trpcMiddleware<{
  ctx: Context;
  input: { promptId: string };
}>().create(async (opts) => {
  const prompt = await opts.ctx.db.query.customPrompts.findFirst({
    where: eq(customPrompts.id, opts.input.promptId),
    columns: {
      userId: true,
    },
  });
  if (!opts.ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User is not authorized",
    });
  }
  if (!prompt) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Prompt not found",
    });
  }
  if (prompt.userId != opts.ctx.user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "User is not allowed to access resource",
    });
  }

  return opts.next();
});

export const promptsAppRouter = router({
  create: authedProcedure
    .input(zNewPromptSchema)
    .output(zPromptSchema)
    .mutation(async ({ input, ctx }) => {
      const [prompt] = await ctx.db
        .insert(customPrompts)
        .values({
          text: input.text,
          appliesTo: input.appliesTo,
          userId: ctx.user.id,
          enabled: true,
        })
        .returning();
      return prompt;
    }),
  update: authedProcedure
    .input(zUpdatePromptSchema)
    .output(zPromptSchema)
    .use(ensurePromptOwnership)
    .mutation(async ({ input, ctx }) => {
      const res = await ctx.db
        .update(customPrompts)
        .set({
          text: input.text,
          appliesTo: input.appliesTo,
          enabled: input.enabled,
        })
        .where(
          and(
            eq(customPrompts.userId, ctx.user.id),
            eq(customPrompts.id, input.promptId),
          ),
        )
        .returning();
      if (res.length == 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return res[0];
    }),
  list: authedProcedure
    .output(z.array(zPromptSchema))
    .query(async ({ ctx }) => {
      const prompts = await ctx.db.query.customPrompts.findMany({
        where: eq(customPrompts.userId, ctx.user.id),
      });
      return prompts;
    }),
  delete: authedProcedure
    .input(
      z.object({
        promptId: z.string(),
      }),
    )
    .use(ensurePromptOwnership)
    .mutation(async ({ input, ctx }) => {
      const res = await ctx.db
        .delete(customPrompts)
        .where(
          and(
            eq(customPrompts.userId, ctx.user.id),
            eq(customPrompts.id, input.promptId),
          ),
        );
      if (res.changes == 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
    }),
});
