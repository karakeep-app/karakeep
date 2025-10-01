import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import {
  bookmarkLinks,
  bookmarks,
  importSessionBookmarks,
  importSessions,
} from "@karakeep/db/schema";
import {
  zCreateImportSessionRequestSchema,
  ZImportSession,
  ZImportSessionWithStats,
} from "@karakeep/shared/types/importSessions";

import type { AuthedContext } from "../index";
import { PrivacyAware } from "./privacy";

export class ImportSession implements PrivacyAware {
  protected constructor(
    protected ctx: AuthedContext,
    public session: ZImportSession,
  ) {}

  static async fromId(
    ctx: AuthedContext,
    importSessionId: string,
  ): Promise<ImportSession> {
    const session = await ctx.db.query.importSessions.findFirst({
      where: eq(importSessions.id, importSessionId),
    });

    if (!session) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Import session not found",
      });
    }

    const importSession = new ImportSession(ctx, session);
    importSession.ensureCanAccess(ctx);
    return importSession;
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
        status: "pending",
        rootListId: input.rootListId,
      })
      .returning();

    return new ImportSession(ctx, session);
  }

  static async getAll(ctx: AuthedContext): Promise<ImportSession[]> {
    const sessions = await ctx.db.query.importSessions.findMany({
      where: eq(importSessions.userId, ctx.user.id),
      orderBy: (importSessions, { desc }) => [desc(importSessions.createdAt)],
    });

    return sessions.map((session) => new ImportSession(ctx, session));
  }

  static async getAllWithPagination(
    ctx: AuthedContext,
    options: {
      limit: number;
      cursor?: string;
    },
  ): Promise<{
    sessions: ZImportSessionWithStats[];
    nextCursor: string | null;
  }> {
    const sessions = await ctx.db.query.importSessions.findMany({
      where: eq(importSessions.userId, ctx.user.id),
      orderBy: (importSessions, { desc }) => [desc(importSessions.createdAt)],
      limit: options.limit + 1, // Get one extra to determine if there's a next page
      ...(options.cursor ? { offset: parseInt(options.cursor) } : {}),
    });

    const hasNextPage = sessions.length > options.limit;
    const sessionsToReturn = hasNextPage ? sessions.slice(0, -1) : sessions;

    // Get stats for each session
    const sessionsWithStats = await Promise.all(
      sessionsToReturn.map(async (session) => {
        const importSession = new ImportSession(ctx, session);
        return await importSession.getWithStats();
      }),
    );

    const nextCursor = hasNextPage
      ? String(parseInt(options.cursor || "0") + options.limit)
      : null;

    return {
      sessions: sessionsWithStats,
      nextCursor,
    };
  }

  ensureCanAccess(ctx: AuthedContext): void {
    if (this.session.userId !== ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to access this import session",
      });
    }
  }

  async attachBookmark(bookmarkId: string): Promise<void> {
    await this.ctx.db.insert(importSessionBookmarks).values({
      importSessionId: this.session.id,
      bookmarkId,
    });
  }

  async getWithStats(): Promise<ZImportSessionWithStats> {
    // Get bookmark counts by status
    const statusCounts = await this.ctx.db
      .select({
        crawlStatus: bookmarkLinks.crawlStatus,
        taggingStatus: bookmarks.taggingStatus,
        count: count(),
      })
      .from(importSessionBookmarks)
      .where(eq(importSessionBookmarks.importSessionId, this.session.id))
      .leftJoin(bookmarks, eq(bookmarks.id, importSessionBookmarks.bookmarkId))
      .leftJoin(
        bookmarkLinks,
        eq(bookmarkLinks.id, importSessionBookmarks.bookmarkId),
      )
      .groupBy(bookmarkLinks.crawlStatus, bookmarks.taggingStatus);

    const stats = {
      totalBookmarks: 0,
      completedBookmarks: 0,
      failedBookmarks: 0,
      pendingBookmarks: 0,
      processingBookmarks: 0,
    };

    statusCounts.forEach((statusCount) => {
      stats.totalBookmarks += statusCount.count;
      if (
        statusCount.crawlStatus === "success" &&
        statusCount.taggingStatus === "success"
      ) {
        stats.completedBookmarks += statusCount.count;
      } else if (
        statusCount.crawlStatus === "failure" ||
        statusCount.taggingStatus === "failure"
      ) {
        stats.failedBookmarks += statusCount.count;
      } else if (
        statusCount.crawlStatus === "pending" ||
        statusCount.taggingStatus === "pending"
      ) {
        stats.pendingBookmarks += statusCount.count;
      }
    });

    return {
      ...this.session,
      status: stats.pendingBookmarks > 0 ? "in_progress" : "completed",
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
