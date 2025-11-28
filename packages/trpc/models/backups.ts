import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db as DONT_USE_db } from "@karakeep/db";
import { backupsTable, users } from "@karakeep/db/schema";

import { AuthedContext } from "..";

export const zBackupSettingsSchema = z.object({
  backupsEnabled: z.boolean(),
  backupsFrequency: z.enum(["daily", "weekly"]),
  backupsRetentionDays: z.number(),
});

export const zUpdateBackupSettingsSchema = z.object({
  backupsEnabled: z.boolean().optional(),
  backupsFrequency: z.enum(["daily", "weekly"]).optional(),
  backupsRetentionDays: z.number().min(1).max(365).optional(),
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

export class BackupSettings {
  static async get(
    ctx: AuthedContext,
  ): Promise<z.infer<typeof zBackupSettingsSchema>> {
    const user = await ctx.db.query.users.findFirst({
      columns: {
        backupsEnabled: true,
        backupsFrequency: true,
        backupsRetentionDays: true,
      },
      where: eq(users.id, ctx.user.id),
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    return {
      backupsEnabled: user.backupsEnabled,
      backupsFrequency: user.backupsFrequency,
      backupsRetentionDays: user.backupsRetentionDays,
    };
  }

  static async update(
    ctx: AuthedContext,
    updates: z.infer<typeof zUpdateBackupSettingsSchema>,
  ): Promise<z.infer<typeof zBackupSettingsSchema>> {
    const [updated] = await ctx.db
      .update(users)
      .set(updates)
      .where(eq(users.id, ctx.user.id))
      .returning({
        backupsEnabled: users.backupsEnabled,
        backupsFrequency: users.backupsFrequency,
        backupsRetentionDays: users.backupsRetentionDays,
      });

    if (!updated) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update backup settings",
      });
    }

    return updated;
  }
}

export class Backup {
  private constructor(
    private ctx: AuthedContext,
    private backup: z.infer<typeof zBackupSchema> & { asset?: any },
  ) {}

  static async fromId(ctx: AuthedContext, backupId: string): Promise<Backup> {
    const backup = await ctx.db.query.backupsTable.findFirst({
      where: and(
        eq(backupsTable.id, backupId),
        eq(backupsTable.userId, ctx.user.id),
      ),
      with: {
        asset: true,
      },
    });

    if (!backup) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Backup not found",
      });
    }

    return new Backup(ctx, backup as any);
  }

  static async getAll(ctx: AuthedContext): Promise<Backup[]> {
    const backups = await ctx.db.query.backupsTable.findMany({
      where: eq(backupsTable.userId, ctx.user.id),
      with: {
        asset: true,
      },
      orderBy: [desc(backupsTable.createdAt)],
    });

    return backups.map((b) => new Backup(ctx, b as any));
  }

  async delete(): Promise<void> {
    // Asset will be deleted automatically via cascade
    await this.ctx.db
      .delete(backupsTable)
      .where(
        and(
          eq(backupsTable.id, this.backup.id),
          eq(backupsTable.userId, this.ctx.user.id),
        ),
      );
  }

  asPublic(): z.infer<typeof zBackupSchema> {
    const { asset, ...backup } = this.backup;
    return backup;
  }

  get id() {
    return this.backup.id;
  }

  get assetId() {
    return this.backup.assetId;
  }

  get asset() {
    return this.backup.asset;
  }
}
