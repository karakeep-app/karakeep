import { z } from "zod";

import {
  DEFAULT_NUM_BOOKMARKS_PER_PAGE,
  MAX_NUM_BOOKMARKS_PER_PAGE,
  zPublicBookmarkSchema,
  zSortOrder,
} from "@karakeep/shared/types/bookmarks";
import { zBookmarkListSchema } from "@karakeep/shared/types/lists";
import { zCursorV2 } from "@karakeep/shared/types/pagination";

import { publicProcedure, router } from "../index";
import { List } from "../models/lists";

const zPublicListNavItemSchema = zBookmarkListSchema.pick({
  id: true,
  name: true,
  icon: true,
});

export const publicBookmarks = router({
  getPublicListMetadata: publicProcedure
    .input(
      z.object({
        listId: z.string(),
      }),
    )
    .output(
      zBookmarkListSchema
        .pick({
          name: true,
          description: true,
          icon: true,
        })
        .extend({ ownerName: z.string() }),
    )
    .query(async ({ input, ctx }) => {
      return await List.getPublicListMetadata(
        ctx,
        input.listId,
        /* token */ null,
      );
    }),
  getPublicListNavigation: publicProcedure
    .input(
      z.object({
        listId: z.string(),
      }),
    )
    .output(
      z.object({
        parents: z.array(zPublicListNavItemSchema),
        children: z.array(zPublicListNavItemSchema),
      }),
    )
    .query(async ({ input, ctx }) => {
      return await List.getPublicListNavigation(ctx, input.listId);
    }),
  getPublicBookmarksInList: publicProcedure
    .input(
      z.object({
        listId: z.string(),
        cursor: zCursorV2.nullish(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_NUM_BOOKMARKS_PER_PAGE)
          .default(DEFAULT_NUM_BOOKMARKS_PER_PAGE),
        sortOrder: zSortOrder.exclude(["relevance"]).optional().default("desc"),
      }),
    )
    .output(
      z.object({
        list: zBookmarkListSchema
          .pick({
            name: true,
            description: true,
            icon: true,
          })
          .extend({ numItems: z.number(), ownerName: z.string() }),
        bookmarks: z.array(zPublicBookmarkSchema),
        nextCursor: zCursorV2.nullable(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return await List.getPublicListContents(
        ctx,
        input.listId,
        /* token */ null,
        {
          limit: input.limit,
          order: input.sortOrder,
          cursor: input.cursor,
        },
      );
    }),
});
