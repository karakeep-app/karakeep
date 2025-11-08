import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { assets, bookmarks } from "@karakeep/db/schema";
import { deleteAsset } from "@karakeep/shared/assetdb";
import {
  zAssetSchema,
  zAssetTypesSchema,
} from "@karakeep/shared/types/bookmarks";

import { authedProcedure, Context, router } from "../index";
import {
  isAllowedToAttachAsset,
  isAllowedToDetachAsset,
  mapDBAssetTypeToUserType,
  mapSchemaAssetTypeToDB,
} from "../lib/attachments";
import { ensureBookmarkOwnership } from "./bookmarks";

export const ensureAssetOwnership = async (opts: {
  ctx: Context;
  assetId: string;
}) => {
  const asset = await opts.ctx.db.query.assets.findFirst({
    where: eq(bookmarks.id, opts.assetId),
  });
  if (!opts.ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User is not authorized",
    });
  }
  if (!asset) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Asset not found",
    });
  }
  if (asset.userId != opts.ctx.user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "User is not allowed to access resource",
    });
  }
  return asset;
};

export const assetsAppRouter = router({
  list: authedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.number().nullish(), // page number
      }),
    )
    .output(
      z.object({
        assets: z.array(
          z.object({
            id: z.string(),
            assetType: zAssetTypesSchema,
            size: z.number(),
            contentType: z.string().nullable(),
            fileName: z.string().nullable(),
            bookmarkId: z.string().nullable(),
          }),
        ),
        nextCursor: z.number().nullish(),
        totalCount: z.number(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const page = input.cursor ?? 1;
      const [results, totalCount] = await Promise.all([
        ctx.db
          .select()
          .from(assets)
          .where(eq(assets.userId, ctx.user.id))
          .orderBy(desc(assets.size))
          .limit(input.limit)
          .offset((page - 1) * input.limit),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(assets)
          .where(eq(assets.userId, ctx.user.id)),
      ]);

      return {
        assets: results.map((a) => ({
          ...a,
          assetType: mapDBAssetTypeToUserType(a.assetType),
        })),
        nextCursor: page * input.limit < totalCount[0].count ? page + 1 : null,
        totalCount: totalCount[0].count,
      };
    }),
  attachAsset: authedProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
        asset: z.object({
          id: z.string(),
          assetType: zAssetTypesSchema,
        }),
      }),
    )
    .output(zAssetSchema)
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      await ensureAssetOwnership({ ctx, assetId: input.asset.id });
      if (!isAllowedToAttachAsset(input.asset.assetType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't attach this type of asset",
        });
      }
      const [updatedAsset] = await ctx.db
        .update(assets)
        .set({
          assetType: mapSchemaAssetTypeToDB(input.asset.assetType),
          bookmarkId: input.bookmarkId,
        })
        .where(
          and(eq(assets.id, input.asset.id), eq(assets.userId, ctx.user.id)),
        )
        .returning();

      return {
        id: updatedAsset.id,
        assetType: mapDBAssetTypeToUserType(updatedAsset.assetType),
        fileName: updatedAsset.fileName,
      };
    }),
  replaceAsset: authedProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
        oldAssetId: z.string(),
        newAssetId: z.string(),
      }),
    )
    .output(z.void())
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      await Promise.all([
        ensureAssetOwnership({ ctx, assetId: input.oldAssetId }),
        ensureAssetOwnership({ ctx, assetId: input.newAssetId }),
      ]);
      const [oldAsset] = await ctx.db
        .select()
        .from(assets)
        .where(
          and(eq(assets.id, input.oldAssetId), eq(assets.userId, ctx.user.id)),
        )
        .limit(1);
      if (
        !isAllowedToAttachAsset(mapDBAssetTypeToUserType(oldAsset.assetType))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't attach this type of asset",
        });
      }

      await ctx.db.transaction(async (tx) => {
        await tx.delete(assets).where(eq(assets.id, input.oldAssetId));
        await tx
          .update(assets)
          .set({
            bookmarkId: input.bookmarkId,
            assetType: oldAsset.assetType,
          })
          .where(eq(assets.id, input.newAssetId));
      });

      await deleteAsset({
        userId: ctx.user.id,
        assetId: input.oldAssetId,
      }).catch(() => ({}));
    }),
  detachAsset: authedProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
        assetId: z.string(),
      }),
    )
    .output(z.void())
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      await ensureAssetOwnership({ ctx, assetId: input.assetId });
      const [oldAsset] = await ctx.db
        .select()
        .from(assets)
        .where(
          and(eq(assets.id, input.assetId), eq(assets.userId, ctx.user.id)),
        );
      if (
        !isAllowedToDetachAsset(mapDBAssetTypeToUserType(oldAsset.assetType))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't deattach this type of asset",
        });
      }
      const result = await ctx.db
        .delete(assets)
        .where(
          and(
            eq(assets.id, input.assetId),
            eq(assets.bookmarkId, input.bookmarkId),
          ),
        );
      if (result.changes == 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await deleteAsset({ userId: ctx.user.id, assetId: input.assetId }).catch(
        () => ({}),
      );
    }),
});
