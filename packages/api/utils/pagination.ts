import { z } from "zod";

import { MAX_NUM_BOOKMARKS_PER_PAGE } from "@karakeep/shared/types/bookmarks";
import { zCursorV2 } from "@karakeep/shared/types/pagination";

export const zPagination = z.object({
  limit: z.coerce.number().max(MAX_NUM_BOOKMARKS_PER_PAGE).optional(),
  cursor: z
    .string()
    .refine((val) => val.includes("_"), "Must be a valid cursor")
    .transform((val) => {
      const [id, createdAt] = val.split("_");
      return { id, createdAt };
    })
    .pipe(z.object({ id: z.string(), createdAt: z.coerce.date() }))
    .optional(),
});

export function adaptPagination<
  T extends { nextCursor: z.infer<typeof zCursorV2> | null },
>(input: T) {
  const { nextCursor, ...rest } = input;
  if (!nextCursor) {
    return input;
  }
  return {
    ...rest,
    nextCursor: `${nextCursor.id}_${nextCursor.createdAt.toISOString()}`,
  };
}
