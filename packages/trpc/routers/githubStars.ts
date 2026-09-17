import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { bookmarkLists, githubStarsSubscriptions } from "@karakeep/db/schema";
import { router, sessionProcedure } from "../index";

const config = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(39)
    .regex(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/),
  listId: z.string(),
  enabled: z.boolean(),
  importTopics: z.boolean(),
});

function assertIdle(leaseUntil: Date | null | undefined) {
  if (leaseUntil && leaseUntil > new Date()) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "An import batch is running. Wait for it to finish before changing settings or disconnecting.",
    });
  }
}

export const githubStarsRouter = router({
  get: sessionProcedure.query(
    ({ ctx }) =>
      ctx.db
        .select()
        .from(githubStarsSubscriptions)
        .where(eq(githubStarsSubscriptions.userId, ctx.user.id))
        .get() ?? null,
  ),
  save: sessionProcedure.input(config).mutation(({ ctx, input }) => {
    return ctx.db.transaction(
      (tx) => {
        const previous = tx
          .select()
          .from(githubStarsSubscriptions)
          .where(eq(githubStarsSubscriptions.userId, ctx.user.id))
          .get();
        assertIdle(previous?.leaseUntil);
        const list = tx
          .select()
          .from(bookmarkLists)
          .where(
            and(
              eq(bookmarkLists.id, input.listId),
              eq(bookmarkLists.userId, ctx.user.id),
              eq(bookmarkLists.type, "manual"),
            ),
          )
          .get();
        if (!list)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose a manual list you own.",
          });
        // New identity invalidates any queued work using the previous configuration.
        tx.delete(githubStarsSubscriptions)
          .where(eq(githubStarsSubscriptions.userId, ctx.user.id))
          .run();
        return tx
          .insert(githubStarsSubscriptions)
          .values({
            ...input,
            userId: ctx.user.id,
            ...(previous?.rateLimitUntil && previous.rateLimitUntil > new Date()
              ? {
                  rateLimitUntil: previous.rateLimitUntil,
                  nextRunAt: previous.rateLimitUntil,
                  lastError: previous.lastError,
                }
              : {}),
          })
          .returning()
          .get();
      },
      { behavior: "immediate" },
    );
  }),
  syncNow: sessionProcedure.mutation(({ ctx }) => {
    const subscription = ctx.db
      .select()
      .from(githubStarsSubscriptions)
      .where(eq(githubStarsSubscriptions.userId, ctx.user.id))
      .get();
    if (!subscription || !subscription.enabled)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Enable the GitHub Stars subscription first.",
      });
    if (subscription.leaseUntil && subscription.leaseUntil > new Date()) return;
    // Respect GitHub cooldowns. A manual sync must not bypass a rate limit.
    if (subscription.rateLimitUntil && subscription.rateLimitUntil > new Date())
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Please wait until the next scheduled retry.",
      });
    ctx.db
      .update(githubStarsSubscriptions)
      .set({ nextRunAt: new Date() })
      .where(eq(githubStarsSubscriptions.id, subscription.id))
      .run();
  }),
  disconnect: sessionProcedure.mutation(({ ctx }) => {
    ctx.db.transaction(
      (tx) => {
        const subscription = tx
          .select()
          .from(githubStarsSubscriptions)
          .where(eq(githubStarsSubscriptions.userId, ctx.user.id))
          .get();
        assertIdle(subscription?.leaseUntil);
        tx.delete(githubStarsSubscriptions)
          .where(eq(githubStarsSubscriptions.userId, ctx.user.id))
          .run();
      },
      { behavior: "immediate" },
    );
  }),
});
