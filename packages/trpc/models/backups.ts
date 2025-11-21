import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db as DONT_USE_db } from "@karakeep/db";
import {
  backupsTable,
  backupSettingsTable,
  assets,
} from "@karakeep/db/schema";

import { AuthedContext } from "..";

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

export class BackupSettings {
  private constructor(
    private ctx: AuthedContext,
    private settings: z.infer<typeof zBackupSettingsSchema>,
  ) {}

  static async get(ctx: AuthedContext): Promise<BackupSettings | null> {
    const settings = await ctx.db.query.backupSettingsTable.findFirst({
      where: eq(backupSettingsTable.userId, ctx.user.id),
    });

    if (!settings) {
      return null;
    }

    return new BackupSettings(ctx, settings as any);
  }

  static async getOrCreate(ctx: AuthedContext): Promise<BackupSettings> {
    let settings = await this.get(ctx);

    if (!settings) {
      // Create default settings
      const [newSettings] = await ctx.db
        .insert(backupSettingsTable)
        .values({
          userId: ctx.user.id,
          enabled: false,
          frequency: "weekly",
          retentionDays: 30,
        })
        .returning();

      settings = new BackupSettings(ctx, newSettings as any);
    }

    return settings;
  }

  async update(
    updates: z.infer<typeof zUpdateBackupSettingsSchema>,
  ): Promise<void> {
    const [updated] = await this.ctx.db
      .update(backupSettingsTable)
      .set(updates)
      .where(eq(backupSettingsTable.userId, this.ctx.user.id))
      .returning();

    if (!updated) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update backup settings",
      });
    }

    this.settings = updated as any;
  }

  asPublic(): z.infer<typeof zBackupSettingsSchema> {
    return this.settings;
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
