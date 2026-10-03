import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  bookmarkLists,
  githubStarsSubscriptions,
  githubStarsConnections,
  githubStarsAuthorizations,
} from "@karakeep/db/schema";
import { router, sessionProcedure } from "../index";

import {
  beginGithubConnection,
  githubConnectionAvailable,
} from "../models/githubStarsConnection";

const config = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(39)
    .regex(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/),
  listId: z.string(),
  source: z.enum(["public", "connected"]).default("public"),
  enabled: z.boolean(),
  recurring: z.boolean().default(true),
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
  connection: sessionProcedure.query(({ ctx }) => ({
    available: githubConnectionAvailable(),
    account:
      ctx.db
        .select({ login: githubStarsConnections.login })
        .from(githubStarsConnections)
        .where(eq(githubStarsConnections.userId, ctx.user.id))
        .get() ?? null,
  })),
  connect: sessionProcedure.mutation(({ ctx }) =>
    beginGithubConnection(ctx.db, ctx.user.id),
  ),
  disconnectAccount: sessionProcedure.mutation(({ ctx }) => {
    ctx.db.transaction(
      (tx) => {
        tx.delete(githubStarsAuthorizations)
          .where(eq(githubStarsAuthorizations.userId, ctx.user.id))
          .run();
        tx.delete(githubStarsConnections)
          .where(eq(githubStarsConnections.userId, ctx.user.id))
          .run();
      },
      { behavior: "immediate" },
    );
  }),
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
        const connection =
          input.source === "connected"
            ? tx
                .select()
                .from(githubStarsConnections)
                .where(eq(githubStarsConnections.userId, ctx.user.id))
                .get()
            : undefined;
        if (input.source === "connected" && !connection)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Connect your GitHub account first.",
          });
        // New identity invalidates any queued work using the previous configuration.
        tx.delete(githubStarsSubscriptions)
          .where(eq(githubStarsSubscriptions.userId, ctx.user.id))
          .run();
        return tx
          .insert(githubStarsSubscriptions)
          .values({
            ...input,
            username: connection?.login ?? input.username,
            connectionId: connection?.id ?? null,
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
