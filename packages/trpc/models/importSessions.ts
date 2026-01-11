import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import {
  importSessionBookmarks,
  importSessions,
  importStagingBookmarks,
} from "@karakeep/db/schema";
import {
  zCreateImportSessionRequestSchema,
  ZImportSession,
  ZImportSessionWithStats,
} from "@karakeep/shared/types/importSessions";

import type { AuthedContext } from "../index";

export class ImportSession {
  protected constructor(
    protected ctx: AuthedContext,
    public session: ZImportSession,
  ) {}

  static async fromId(
    ctx: AuthedContext,
    importSessionId: string,
  ): Promise<ImportSession> {
    const session = await ctx.db.query.importSessions.findFirst({
      where: and(
        eq(importSessions.id, importSessionId),
        eq(importSessions.userId, ctx.user.id),
      ),
    });

    if (!session) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Import session not found",
      });
    }

    return new ImportSession(ctx, session);
  }

  static async create(
    ctx: AuthedContext,
    input: z.infer<typeof zCreateImportSessionRequestSchema>,
  ): Promise<ImportSession> {
    const [session] = await ctx.db
      .insert(importSessions)
      .values({
        name: input.name,
        userId: ctx.user.id,
        rootListId: input.rootListId,
      })
      .returning();

    return new ImportSession(ctx, session);
  }

  static async getAll(ctx: AuthedContext): Promise<ImportSession[]> {
    const sessions = await ctx.db.query.importSessions.findMany({
      where: eq(importSessions.userId, ctx.user.id),
      orderBy: (importSessions, { desc }) => [desc(importSessions.createdAt)],
      limit: 50,
    });

    return sessions.map((session) => new ImportSession(ctx, session));
  }

  static async getAllWithStats(
    ctx: AuthedContext,
  ): Promise<ZImportSessionWithStats[]> {
    const sessions = await this.getAll(ctx);

    return await Promise.all(
      sessions.map(async (session) => {
        return await session.getWithStats();
      }),
    );
  }

  async attachBookmark(bookmarkId: string): Promise<void> {
    await this.ctx.db.insert(importSessionBookmarks).values({
      importSessionId: this.session.id,
      bookmarkId,
    });
  }

  async getWithStats(): Promise<ZImportSessionWithStats> {
    // Get bookmark counts by status from staging table
    const statusCounts = await this.ctx.db
      .select({
        status: importStagingBookmarks.status,
        count: count(),
      })
      .from(importStagingBookmarks)
      .where(eq(importStagingBookmarks.importSessionId, this.session.id))
      .groupBy(importStagingBookmarks.status);

    const stats = {
      totalBookmarks: 0,
      completedBookmarks: 0,
      failedBookmarks: 0,
      pendingBookmarks: 0,
      processingBookmarks: 0,
    };

    statusCounts.forEach((statusCount) => {
      const { status, count: itemCount } = statusCount;

      stats.totalBookmarks += itemCount;

      if (status === "pending") {
        stats.pendingBookmarks += itemCount;
      } else if (status === "processing") {
        stats.processingBookmarks += itemCount;
      } else if (status === "completed") {
        stats.completedBookmarks += itemCount;
      } else if (status === "failed") {
        stats.failedBookmarks += itemCount;
      }
    });

    return {
      ...this.session,
      status: this.session.status,
      ...stats,
    };
  }

  async delete(): Promise<void> {
    // Delete the session (cascade will handle the bookmarks)
    const result = await this.ctx.db
      .delete(importSessions)
      .where(
        and(
          eq(importSessions.id, this.session.id),
          eq(importSessions.userId, this.ctx.user.id),
        ),
      );

    if (result.changes === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Import session not found",
      });
    }
  }
}
