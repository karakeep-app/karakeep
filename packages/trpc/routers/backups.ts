import { z } from "zod";

import { BackupQueue } from "@karakeep/shared-server";

import { authedProcedure, router } from "../index";
import {
  Backup,
  BackupSettings,
  zBackupSchema,
  zBackupSettingsSchema,
  zUpdateBackupSettingsSchema,
} from "../models/backups";

export const backupsAppRouter = router({
  getSettings: authedProcedure
    .output(zBackupSettingsSchema)
    .query(async ({ ctx }) => {
      return await BackupSettings.get(ctx);
    }),

  updateSettings: authedProcedure
    .input(zUpdateBackupSettingsSchema)
    .output(zBackupSettingsSchema)
    .mutation(async ({ input, ctx }) => {
      return await BackupSettings.update(ctx, input);
    }),

  list: authedProcedure
    .output(z.object({ backups: z.array(zBackupSchema) }))
    .query(async ({ ctx }) => {
      const backups = await Backup.getAll(ctx);
      return { backups: backups.map((b) => b.asPublic()) };
    }),

  get: authedProcedure
    .input(
      z.object({
        backupId: z.string(),
      }),
    )
    .output(zBackupSchema)
    .query(async ({ ctx, input }) => {
      const backup = await Backup.fromId(ctx, input.backupId);
      return backup.asPublic();
    }),

  delete: authedProcedure
    .input(
      z.object({
        backupId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const backup = await Backup.fromId(ctx, input.backupId);
      await backup.delete();
    }),

  triggerBackup: authedProcedure.mutation(async ({ ctx }) => {
    // Trigger a backup job for the current user
    await BackupQueue.enqueue({
      userId: ctx.user.id,
    });
  }),
});
