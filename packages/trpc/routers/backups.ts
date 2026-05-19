import { z } from "zod";

import { zBackupSchema } from "@karakeep/shared/types/backups";

import {
  createRateLimitMiddleware,
  createScopedAuthedProcedure,
  router,
} from "../index";
import { Backup } from "../models/backups";

const backupsProcedure = createScopedAuthedProcedure("backups");

export const backupsAppRouter = router({
  list: backupsProcedure
    .output(z.object({ backups: z.array(zBackupSchema) }))
    .query(async ({ ctx }) => {
      const backups = await Backup.getAll(ctx);
      return { backups: backups.map((b) => b.asPublic()) };
    }),

  get: backupsProcedure
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

  delete: backupsProcedure
    .input(
      z.object({
        backupId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const backup = await Backup.fromId(ctx, input.backupId);
      await backup.delete();
    }),

  triggerBackup: backupsProcedure
    .use(
      createRateLimitMiddleware({
        name: "backups.triggerBackup",
        windowMs: 60 * 60 * 1000, // 1 hour window
        maxRequests: 5, // Max 5 backup triggers per hour
      }),
    )
    .output(zBackupSchema)
    .mutation(async ({ ctx }) => {
      const backup = await Backup.create(ctx);
      await backup.triggerBackgroundJob();

      return backup.asPublic();
    }),
});
