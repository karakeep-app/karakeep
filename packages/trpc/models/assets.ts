import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  isNull,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { assets, bookmarkLinks, bookmarks } from "@karakeep/db/schema";
import { deleteAsset } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { createSignedToken } from "@karakeep/shared/signedTokens";
import { zAssetSignedTokenSchema } from "@karakeep/shared/types/assets";
import { zAssetTypesSchema } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

import { AuthedContext } from "..";
import {
  isAllowedToAttachAsset,
  isAllowedToDetachAsset,
  mapDBAssetTypeToUserType,
  mapSchemaAssetTypeToDB,
} from "../lib/attachments";
import { BareBookmark } from "./bookmarks";

const listColumns = {
  ...getTableColumns(assets),
  bookmarkTitle: bookmarks.title,
  linkTitle: bookmarkLinks.title,
  linkUrl: bookmarkLinks.url,
};

export class Asset {
  constructor(
    protected ctx: AuthedContext,
    public asset: typeof assets.$inferSelect,
  ) {}

  static async fromId(ctx: AuthedContext, id: string): Promise<Asset> {
    const assetdb = await ctx.db.query.assets.findFirst({
      where: eq(assets.id, id),
    });

    if (!assetdb) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Asset not found",
      });
    }

    const asset = new Asset(ctx, assetdb);

    if (!(await asset.canUserView())) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Asset not found",
      });
    }

    return asset;
  }

  static async list(
    ctx: AuthedContext,
    input: {
      limit: number;
      cursor: number | null;
      sortBy: "size" | "newest";
    },
  ) {
    const page = input.cursor ?? 1;
    const offset = (page - 1) * input.limit;
    const [results, [totals]] = await Promise.all([
      input.sortBy === "newest"
        ? Asset.listNewest(ctx, input.limit, offset)
        : ctx.db
            .select(listColumns)
            .from(assets)
            .leftJoin(bookmarks, eq(assets.bookmarkId, bookmarks.id))
            .leftJoin(bookmarkLinks, eq(assets.bookmarkId, bookmarkLinks.id))
            .where(eq(assets.userId, ctx.user.id))
            // Walks assets_userId_size_idx. The id keeps the order stable
            // across pages.
            .orderBy(desc(assets.size), asc(assets.id))
            .limit(input.limit)
            .offset(offset),
      ctx.db
        .select({
          count: count(),
          size: sql<number>`coalesce(sum(${assets.size}), 0)`,
        })
        .from(assets)
        .where(eq(assets.userId, ctx.user.id)),
    ]);

    return {
      assets: results.map(({ bookmarkTitle, linkTitle, linkUrl, ...a }) => ({
        ...a,
        assetType: mapDBAssetTypeToUserType(a.assetType),
        bookmarkTitle: bookmarkTitle ?? linkTitle,
        bookmarkUrl: linkUrl,
      })),
      nextCursor: page * input.limit < totals.count ? page + 1 : null,
      totalCount: totals.count,
      totalSize: totals.size,
    };
  }

  /**
   * Assets have no timestamp of their own, so "newest" goes by their bookmark.
   * Sorting assets by a joined column would sort every asset the user has on
   * each page. Walking the user's bookmarks in date order uses
   * bookmarks_userId_lastSavedAt_id_idx and stops at the page. Assets without
   * a bookmark (avatars, backups) come after the rest.
   */
  private static async listNewest(
    ctx: AuthedContext,
    limit: number,
    offset: number,
  ) {
    // Filtering on the bookmark's owner only: an asset on the user's bookmark
    // is theirs, and a filter on assets.userId would let SQLite (without
    // ANALYZE stats) drive from assets_userId_size_idx and sort everything.
    const attached = await ctx.db
      .select(listColumns)
      .from(bookmarks)
      .innerJoin(assets, eq(assets.bookmarkId, bookmarks.id))
      .leftJoin(bookmarkLinks, eq(bookmarkLinks.id, bookmarks.id))
      .where(eq(bookmarks.userId, ctx.user.id))
      .orderBy(desc(bookmarks.createdAt), desc(bookmarks.id), asc(assets.id))
      .limit(limit)
      .offset(offset);
    if (attached.length === limit) {
      return attached;
    }

    // This page runs past the assets with a bookmark, so fill it from the
    // rest. A short page ends at the last of them, so their count is only
    // needed when the page holds none.
    const attachedCount =
      attached.length > 0
        ? offset + attached.length
        : (
            await ctx.db
              .select({ attachedCount: count() })
              .from(bookmarks)
              .innerJoin(assets, eq(assets.bookmarkId, bookmarks.id))
              .where(eq(bookmarks.userId, ctx.user.id))
          )[0].attachedCount;
    const unattached = await ctx.db
      .select({
        ...getTableColumns(assets),
        bookmarkTitle: sql<string | null>`null`,
        linkTitle: sql<string | null>`null`,
        linkUrl: sql<string | null>`null`,
      })
      .from(assets)
      .where(and(eq(assets.userId, ctx.user.id), isNull(assets.bookmarkId)))
      .orderBy(asc(assets.id))
      .limit(limit - attached.length)
      .offset(Math.max(0, offset - attachedCount));
    return [...attached, ...unattached];
  }

  static async attachAsset(
    ctx: AuthedContext,
    input: {
      bookmarkId: string;
      asset: {
        id: string;
        assetType: z.infer<typeof zAssetTypesSchema>;
      };
    },
  ) {
    const [asset] = await Promise.all([
      Asset.fromId(ctx, input.asset.id),
      this.ensureBookmarkOwnership(ctx, input.bookmarkId),
    ]);
    asset.ensureOwnership();

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
      .where(and(eq(assets.id, input.asset.id), eq(assets.userId, ctx.user.id)))
      .returning();

    return {
      id: updatedAsset.id,
      assetType: mapDBAssetTypeToUserType(updatedAsset.assetType),
      fileName: updatedAsset.fileName,
    };
  }

  static async replaceAsset(
    ctx: AuthedContext,
    input: {
      bookmarkId: string;
      oldAssetId: string;
      newAssetId: string;
    },
  ) {
    const [oldAsset, newAsset] = await Promise.all([
      Asset.fromId(ctx, input.oldAssetId),
      Asset.fromId(ctx, input.newAssetId),
      this.ensureBookmarkOwnership(ctx, input.bookmarkId),
    ]);
    oldAsset.ensureOwnership();
    newAsset.ensureOwnership();

    if (
      !isAllowedToAttachAsset(
        mapDBAssetTypeToUserType(oldAsset.asset.assetType),
      )
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You can't attach this type of asset",
      });
    }

    await ctx.db.transaction((tx) => {
      tx.delete(assets).where(eq(assets.id, input.oldAssetId)).run();
      tx.update(assets)
        .set({
          bookmarkId: input.bookmarkId,
          assetType: oldAsset.asset.assetType,
        })
        .where(eq(assets.id, input.newAssetId))
        .run();
    });

    await deleteAsset({
      userId: ctx.user.id,
      assetId: input.oldAssetId,
    }).catch(() => ({}));
  }

  static async detachAsset(
    ctx: AuthedContext,
    input: {
      bookmarkId: string;
      assetId: string;
    },
  ) {
    const [asset] = await Promise.all([
      Asset.fromId(ctx, input.assetId),
      this.ensureBookmarkOwnership(ctx, input.bookmarkId),
    ]);

    if (
      !isAllowedToDetachAsset(mapDBAssetTypeToUserType(asset.asset.assetType))
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You can't detach this type of asset",
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
  }

  private static async ensureBookmarkOwnership(
    ctx: AuthedContext,
    bookmarkId: string,
  ) {
    const bookmark = await BareBookmark.bareFromId(ctx, bookmarkId);
    bookmark.ensureOwnership();
  }

  ensureOwnership() {
    if (this.asset.userId != this.ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to access resource",
      });
    }
  }

  static async ensureOwnership(ctx: AuthedContext, assetId: string) {
    return (await Asset.fromId(ctx, assetId)).ensureOwnership();
  }

  async canUserView(): Promise<boolean> {
    // Asset owner can always view it
    if (this.asset.userId === this.ctx.user.id) {
      return true;
    }

    // Avatars are always public
    if (this.asset.assetType === "avatar") {
      return true;
    }

    // If asset is attached to a bookmark, check bookmark access permissions
    if (this.asset.bookmarkId) {
      try {
        // This throws if the user doesn't have access to the bookmark
        await BareBookmark.bareFromId(this.ctx, this.asset.bookmarkId);
        return true;
      } catch (e) {
        if (e instanceof TRPCError && e.code === "FORBIDDEN") {
          return false;
        }
        throw e;
      }
    }

    return false;
  }

  async ensureCanView() {
    if (!(await this.canUserView())) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Asset not found",
      });
    }
  }

  getUrl() {
    return getAssetUrl(this.asset.id);
  }

  static getPublicSignedAssetUrl(
    assetId: string,
    assetOwnerId: string,
    expireAt: number,
  ) {
    const payload: z.infer<typeof zAssetSignedTokenSchema> = {
      assetId,
      userId: assetOwnerId,
    };
    const signedToken = createSignedToken(
      payload,
      serverConfig.signingSecret(),
      expireAt,
    );
    return `${serverConfig.publicApiUrl}/public/assets/${assetId}?token=${signedToken}`;
  }
}
