import { z } from "zod";

export const zCursorV2 = z.object({
  createdAt: z.date(),
  id: z.string(),
  archivedAt: z.date().nullable().optional(),
});

export type ZCursor = z.infer<typeof zCursorV2>;
