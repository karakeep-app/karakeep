import { z } from "zod";

import {
  MAX_NUM_BOOKMARKS_PER_PAGE,
  zPublicBookmarkSchema,
  zSortOrder,
} from "@karakeep/shared/types/bookmarks";
import { zBookmarkListSchema } from "@karakeep/shared/types/lists";
import { zCursorV2 } from "@karakeep/shared/types/pagination";

import { publicProcedure, router } from "../index";
import { List } from "../models/lists";

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
        .merge(z.object({ ownerName: z.string() })),
    )
    .query(async ({ input, ctx }) => {
      return await List.getPublicListMetadata(
        ctx,
        input.listId,
        /* token */ null,
      );
    }),
  getPublicBookmarksInList: publicProcedure
    .input(
      z.object({
        listId: z.string(),
        cursor: zCursorV2.nullish(),
        limit: z.number().max(MAX_NUM_BOOKMARKS_PER_PAGE).default(20),
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
          .merge(z.object({ numItems: z.number(), ownerName: z.string() })),
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
