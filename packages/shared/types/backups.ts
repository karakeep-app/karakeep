import { z } from "zod";

export const zBackupSchema = z.object({
  id: z.string(),
  userId: z.string(),
  assetId: z.string().nullable(),
  createdAt: z.date(),
  size: z.number(),
  bookmarkCount: z.number(),
  status: z.enum(["pending", "success", "failure"]),
  errorMessage: z.string().nullable().optional(),
});

export type ZBackup = z.infer<typeof zBackupSchema>;
