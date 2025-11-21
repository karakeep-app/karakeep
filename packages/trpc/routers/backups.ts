import { z } from "zod";

import { BackupQueue } from "@karakeep/shared-server";
import { readAsset } from "@karakeep/shared/assetdb";

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
      const settings = await BackupSettings.getOrCreate(ctx);
      return settings.asPublic();
    }),

  updateSettings: authedProcedure
    .input(zUpdateBackupSettingsSchema)
    .output(zBackupSettingsSchema)
    .mutation(async ({ input, ctx }) => {
      const settings = await BackupSettings.getOrCreate(ctx);
      await settings.update(input);
      return settings.asPublic();
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

  download: authedProcedure
    .input(
      z.object({
        backupId: z.string(),
      }),
    )
    .output(
      z.object({
        data: z.string(), // base64 encoded
        fileName: z.string(),
        contentType: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const backup = await Backup.fromId(ctx, input.backupId);

      // Read the asset
      const { asset: assetBuffer } = await readAsset({
        userId: ctx.user.id,
        assetId: backup.assetId,
      });

      if (!assetBuffer) {
        throw new Error("Backup file not found");
      }

      return {
        data: assetBuffer.toString("base64"),
        fileName: backup.asset?.fileName || "backup.json.gz",
        contentType: backup.asset?.contentType || "application/gzip",
      };
    }),

  triggerBackup: authedProcedure.mutation(async ({ ctx }) => {
    // Trigger a backup job for the current user
    await BackupQueue.enqueue({
      userId: ctx.user.id,
    });
  }),
});
