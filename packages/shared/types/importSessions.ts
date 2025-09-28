import { z } from "zod";

export const zImportSessionStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);
export type ZImportSessionStatus = z.infer<typeof zImportSessionStatusSchema>;

export const zImportSessionBookmarkStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
]);
export type ZImportSessionBookmarkStatus = z.infer<
  typeof zImportSessionBookmarkStatusSchema
>;

export const zImportSessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  userId: z.string(),
  status: zImportSessionStatusSchema,
  message: z.string().nullable(),
  rootListId: z.string().nullable(),
  createdAt: z.date(),
  modifiedAt: z.date().nullable(),
});
export type ZImportSession = z.infer<typeof zImportSessionSchema>;

export const zImportSessionWithStatsSchema = zImportSessionSchema.extend({
  totalBookmarks: z.number(),
  completedBookmarks: z.number(),
  failedBookmarks: z.number(),
  pendingBookmarks: z.number(),
  processingBookmarks: z.number(),
});
export type ZImportSessionWithStats = z.infer<
  typeof zImportSessionWithStatsSchema
>;

export const zCreateImportSessionRequestSchema = z.object({
  name: z.string().min(1).max(255),
  rootListId: z.string().optional(),
});
export type ZCreateImportSessionRequest = z.infer<
  typeof zCreateImportSessionRequestSchema
>;

export const zAttachBookmarkToSessionRequestSchema = z.object({
  importSessionId: z.string(),
  bookmarkId: z.string(),
});
export type ZAttachBookmarkToSessionRequest = z.infer<
  typeof zAttachBookmarkToSessionRequestSchema
>;

export const zGetImportSessionStatsRequestSchema = z.object({
  importSessionId: z.string(),
});
export type ZGetImportSessionStatsRequest = z.infer<
  typeof zGetImportSessionStatsRequestSchema
>;

export const zListImportSessionsRequestSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
});
export type ZListImportSessionsRequest = z.infer<
  typeof zListImportSessionsRequestSchema
>;

export const zListImportSessionsResponseSchema = z.object({
  sessions: z.array(zImportSessionWithStatsSchema),
  nextCursor: z.string().nullable(),
});
export type ZListImportSessionsResponse = z.infer<
  typeof zListImportSessionsResponseSchema
>;

export const zDeleteImportSessionRequestSchema = z.object({
  importSessionId: z.string(),
});
export type ZDeleteImportSessionRequest = z.infer<
  typeof zDeleteImportSessionRequestSchema
>;
