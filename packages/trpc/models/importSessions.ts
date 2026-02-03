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

  async stageBookmarks(
    bookmarks: {
      type: "link" | "text" | "asset";
      url?: string;
      title?: string;
      content?: string;
      note?: string;
      tags: string[];
      listPaths: string[];
      sourceAddedAt?: Date;
    }[],
  ): Promise<void> {
    if (this.session.status !== "staging") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Session not in staging status",
      });
    }

    // Filter out invalid bookmarks (link without url, text without content)
    const validBookmarks = bookmarks.filter((bookmark) => {
      if (bookmark.type === "link" && !bookmark.url) return false;
      if (bookmark.type === "text" && !bookmark.content) return false;
      return true;
    });

    if (validBookmarks.length === 0) {
      return;
    }

    await this.ctx.db.insert(importStagingBookmarks).values(
      validBookmarks.map((bookmark) => ({
        importSessionId: this.session.id,
        type: bookmark.type,
        url: bookmark.url,
        title: bookmark.title,
        content: bookmark.content,
        note: bookmark.note,
        tags: bookmark.tags,
        listPaths: bookmark.listPaths,
        sourceAddedAt: bookmark.sourceAddedAt,
        status: "pending" as const,
      })),
    );
  }

  async finalize(): Promise<void> {
    if (this.session.status !== "staging") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Session not in staging status",
      });
    }

    await this.ctx.db
      .update(importSessions)
      .set({ status: "pending" })
      .where(eq(importSessions.id, this.session.id));
  }

  async pause(): Promise<void> {
    if (!["pending", "running"].includes(this.session.status)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Session cannot be paused in current status",
      });
    }

    await this.ctx.db
      .update(importSessions)
      .set({ status: "paused" })
      .where(eq(importSessions.id, this.session.id));
  }

  async resume(): Promise<void> {
    if (this.session.status !== "paused") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Session not paused",
      });
    }

    await this.ctx.db
      .update(importSessions)
      .set({ status: "pending" })
      .where(eq(importSessions.id, this.session.id));
  }
}
