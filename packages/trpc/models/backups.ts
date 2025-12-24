import { TRPCError } from "@trpc/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";

import { assets, backupsTable } from "@karakeep/db/schema";
import { BackupQueue } from "@karakeep/shared-server";
import { deleteAsset } from "@karakeep/shared/assetdb";
import { zBackupSchema } from "@karakeep/shared/types/backups";

import { AuthedContext } from "..";

export class Backup {
  private constructor(
    private ctx: AuthedContext,
    private backup: z.infer<typeof zBackupSchema>,
  ) {}

  static async fromId(ctx: AuthedContext, backupId: string): Promise<Backup> {
    const backup = await ctx.db.query.backupsTable.findFirst({
      where: and(
        eq(backupsTable.id, backupId),
        eq(backupsTable.userId, ctx.user.id),
      ),
    });

    if (!backup) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Backup not found",
      });
    }

    return new Backup(ctx, backup);
  }

  private static fromData(
    ctx: AuthedContext,
    backup: z.infer<typeof zBackupSchema>,
  ): Backup {
    return new Backup(ctx, backup);
  }

  static async getAll(ctx: AuthedContext): Promise<Backup[]> {
    const backups = await ctx.db.query.backupsTable.findMany({
      where: eq(backupsTable.userId, ctx.user.id),
      orderBy: [desc(backupsTable.createdAt)],
    });

    return backups.map((b) => new Backup(ctx, b));
  }

  static async create(ctx: AuthedContext): Promise<Backup> {
    const [backup] = await ctx.db
      .insert(backupsTable)
      .values({
        userId: ctx.user.id,
        size: 0,
        bookmarkCount: 0,
        status: "pending",
      })
      .returning();
    return new Backup(ctx, backup!);
  }

  async triggerBackgroundJob({
    delayMs,
    idempotencyKey,
  }: { delayMs?: number; idempotencyKey?: string } = {}): Promise<void> {
    await BackupQueue.enqueue(
      {
        userId: this.ctx.user.id,
        backupId: this.backup.id,
      },
      {
        delayMs,
        idempotencyKey,
      },
    );
  }

  /**
   * Generic update method for backup records
   */
  async update(
    data: Partial<{
      size: number;
      bookmarkCount: number;
      status: "pending" | "success" | "failure";
      assetId: string | null;
      errorMessage: string | null;
    }>,
  ): Promise<void> {
    await this.ctx.db
      .update(backupsTable)
      .set(data)
      .where(
        and(
          eq(backupsTable.id, this.backup.id),
          eq(backupsTable.userId, this.ctx.user.id),
        ),
      );

    // Update local state
    this.backup = { ...this.backup, ...data };
  }

  async delete(): Promise<void> {
    if (this.backup.assetId) {
      // Delete asset
      await deleteAsset({
        userId: this.ctx.user.id,
        assetId: this.backup.assetId,
      });
    }

    await this.ctx.db.transaction(async (db) => {
      // Delete asset first
      if (this.backup.assetId) {
        await db
          .delete(assets)
          .where(
            and(
              eq(assets.id, this.backup.assetId),
              eq(assets.userId, this.ctx.user.id),
            ),
          );
      }

      // Delete backup record
      await db
        .delete(backupsTable)
        .where(
          and(
            eq(backupsTable.id, this.backup.id),
            eq(backupsTable.userId, this.ctx.user.id),
          ),
        );
    });
  }

  /**
   * Finds backups older than the retention period
   */
  static async findOldBackups(
    ctx: AuthedContext,
    retentionDays: number,
  ): Promise<Backup[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const oldBackups = await ctx.db.query.backupsTable.findMany({
      where: and(
        eq(backupsTable.userId, ctx.user.id),
        lt(backupsTable.createdAt, cutoffDate),
      ),
    });

    return oldBackups.map((backup) => Backup.fromData(ctx, backup));
  }

  asPublic(): z.infer<typeof zBackupSchema> {
    return this.backup;
  }

  get id() {
    return this.backup.id;
  }

  get assetId() {
    return this.backup.assetId;
  }
}
