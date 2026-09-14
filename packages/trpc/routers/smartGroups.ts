import { TRPCError } from "@trpc/server";
import { count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { bookmarkClusters, bookmarksInClusters } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import { SmartGroupsQueue } from "@karakeep/shared-server";

import { createScopedAuthedProcedure, router } from "../index";

const smartGroupsProcedure = createScopedAuthedProcedure("smartGroups");

function ensureSmartGroupsEnabled() {
  if (
    !serverConfig.smartGroups.enabled ||
    !serverConfig.embedding.enableAutoIndexing
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Smart Groups is not enabled",
    });
  }
}

const zSmartGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
  numBookmarks: z.number(),
});

export const smartGroupsAppRouter = router({
  list: smartGroupsProcedure
    .output(z.object({ groups: z.array(zSmartGroupSchema) }))
    .query(async ({ ctx }) => {
      ensureSmartGroupsEnabled();

      const [clusters, memberCounts] = await Promise.all([
        ctx.db
          .select()
          .from(bookmarkClusters)
          .where(eq(bookmarkClusters.userId, ctx.user.id))
          .orderBy(desc(bookmarkClusters.updatedAt)),
        ctx.db
          .select({
            clusterId: bookmarksInClusters.clusterId,
            value: count(),
          })
          .from(bookmarksInClusters)
          .innerJoin(
            bookmarkClusters,
            eq(bookmarkClusters.id, bookmarksInClusters.clusterId),
          )
          .where(eq(bookmarkClusters.userId, ctx.user.id))
          .groupBy(bookmarksInClusters.clusterId),
      ]);

      const countByCluster = new Map(
        memberCounts.map((m) => [m.clusterId, m.value]),
      );

      return {
        groups: clusters.map((c) => ({
          id: c.id,
          label: c.label,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt ?? null,
          numBookmarks: countByCluster.get(c.id) ?? 0,
        })),
      };
    }),

  get: smartGroupsProcedure
    .input(z.object({ clusterId: z.string() }))
    .output(zSmartGroupSchema)
    .query(async ({ input, ctx }) => {
      ensureSmartGroupsEnabled();

      const cluster = await ctx.db.query.bookmarkClusters.findFirst({
        where: eq(bookmarkClusters.id, input.clusterId),
      });
      if (!cluster || cluster.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Smart Group not found",
        });
      }

      const [{ value: numBookmarks }] = await ctx.db
        .select({ value: count() })
        .from(bookmarksInClusters)
        .where(eq(bookmarksInClusters.clusterId, cluster.id));

      return {
        id: cluster.id,
        label: cluster.label,
        createdAt: cluster.createdAt,
        updatedAt: cluster.updatedAt ?? null,
        numBookmarks,
      };
    }),

  regenerateNow: smartGroupsProcedure.mutation(async ({ ctx }) => {
    ensureSmartGroupsEnabled();
    await SmartGroupsQueue.enqueue(
      { userId: ctx.user.id },
      { groupId: ctx.user.id },
    );
  }),
});
