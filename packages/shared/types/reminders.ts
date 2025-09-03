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

// For creating a new reminder
export const zCreateReminderRequestSchema = z.object({
  bookmarkId: z.string(),
  remindAt: z.date(),
});

export type ZCreateReminderRequest = z.infer<
  typeof zCreateReminderRequestSchema
>;

// For updating an existing reminder
export const zUpdateReminderRequestSchema = z.object({
  reminderId: z.string(),
  remindAt: z.date().optional(),
  status: z.enum(["active", "dismissed"]).optional(),
});

export type ZUpdateReminderRequest = z.infer<
  typeof zUpdateReminderRequestSchema
>;

// For getting reminders
export const zGetRemindersRequestSchema = z.object({
  bookmarkId: z.string().optional(),
  status: z.enum(["active", "dismissed"]).optional(),
  // For filtering reminders on the reminders page
  reminderType: z.enum(["due", "upcoming", "dismissed"]).optional(),
});

export type ZGetRemindersRequest = z.infer<typeof zGetRemindersRequestSchema>;

export const zGetRemindersResponseSchema = z.object({
  reminders: z.array(zReminderSchema),
});

export type ZGetRemindersResponse = z.infer<typeof zGetRemindersResponseSchema>;
