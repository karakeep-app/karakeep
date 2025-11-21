import { z } from "zod";

export const zBackupSettingsSchema = z.object({
  id: z.string(),
  userId: z.string(),
  enabled: z.boolean(),
  frequency: z.enum(["daily", "weekly"]),
  retentionDays: z.number(),
  createdAt: z.date(),
  modifiedAt: z.date().nullable(),
});

export const zUpdateBackupSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  frequency: z.enum(["daily", "weekly"]).optional(),
  retentionDays: z.number().min(1).max(365).optional(),
});

export const zBackupSchema = z.object({
  id: z.string(),
  userId: z.string(),
  assetId: z.string(),
  createdAt: z.date(),
  size: z.number(),
  bookmarkCount: z.number(),
  status: z.enum(["pending", "success", "failure"]),
  errorMessage: z.string().nullable().optional(),
});

export type ZBackupSettings = z.infer<typeof zBackupSettingsSchema>;
export type ZUpdateBackupSettings = z.infer<typeof zUpdateBackupSettingsSchema>;
export type ZBackup = z.infer<typeof zBackupSchema>;
