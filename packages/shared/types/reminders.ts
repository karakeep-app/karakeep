import { z } from "zod";

export const zReminderSchema = z.object({
  id: z.string(),
  bookmarkId: z.string(),
  remindAt: z.date(),
  status: z.enum(["active", "dismissed"]),
  createdAt: z.date(),
  modifiedAt: z.date().nullable(),
});

export type ZReminder = z.infer<typeof zReminderSchema>;

export const zCreateReminderRequestSchema = z.object({
  bookmarkId: z.string(),
  remindAt: z.date(),
});

export type ZCreateReminderRequest = z.infer<
  typeof zCreateReminderRequestSchema
>;

export const zUpdateReminderRequestSchema = z
  .object({
    reminderId: z.string(),
    remindAt: z.date().optional(),
    status: z.enum(["active", "dismissed"]).optional(),
  })
  .refine((data) => data.remindAt !== undefined || data.status !== undefined, {
    message: "Must provide at least one field to update (remindAt or status)",
  });

export type ZUpdateReminderRequest = z.infer<
  typeof zUpdateReminderRequestSchema
>;

export const zGetRemindersRequestSchema = z.object({
  bookmarkId: z.string().optional(),
  status: z.enum(["active", "dismissed"]).optional(),
  reminderType: z.enum(["due", "upcoming", "dismissed"]).optional(),
  clientTimestamp: z.number().int().min(0).optional(),
});

export type ZGetRemindersRequest = z.infer<typeof zGetRemindersRequestSchema>;

export const zGetRemindersResponseSchema = z.object({
  reminders: z.array(zReminderSchema),
});

export type ZGetRemindersResponse = z.infer<typeof zGetRemindersResponseSchema>;

export const zGetRemindersCountsRequestSchema = z.object({
  clientTimestamp: z.number().int().min(0).optional(),
});

export type ZGetRemindersCountsRequest = z.infer<
  typeof zGetRemindersCountsRequestSchema
>;

export const zGetRemindersCountsResponseSchema = z.object({
  dueCount: z.number(),
  upcomingCount: z.number(),
  dismissedCount: z.number(),
});

export type ZGetRemindersCountsResponse = z.infer<
  typeof zGetRemindersCountsResponseSchema
>;
