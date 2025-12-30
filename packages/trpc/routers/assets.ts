import { z } from "zod";

import {
  zAssetSchema,
  zAssetTypesSchema,
} from "@karakeep/shared/types/bookmarks";

import { authedProcedure, router } from "../index";
import { Asset } from "../models/assets";
import { ensureBookmarkOwnership } from "./bookmarks";

export const assetsAppRouter = router({
  list: authedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.number().nullish(),
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
      return await Asset.list(ctx, {
        limit: input.limit,
        cursor: input.cursor ?? null,
      });
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
      return await Asset.attachAsset(ctx, input);
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
      await Asset.replaceAsset(ctx, input);
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
      await Asset.detachAsset(ctx, input);
    }),
});
