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
    // Get bookmark counts by status including indexing status
    const statusCounts = await this.ctx.db
      .select({
        crawlStatus: bookmarkLinks.crawlStatus,
        taggingStatus: bookmarks.taggingStatus,
        lastIndexedAt: bookmarks.lastIndexedAt,
        count: count(),
      })
      .from(importSessionBookmarks)
      .innerJoin(
        importSessions,
        eq(importSessions.id, importSessionBookmarks.importSessionId),
      )
      .leftJoin(bookmarks, eq(bookmarks.id, importSessionBookmarks.bookmarkId))
      .leftJoin(
        bookmarkLinks,
        eq(bookmarkLinks.id, importSessionBookmarks.bookmarkId),
      )
      .where(
        and(
          eq(importSessionBookmarks.importSessionId, this.session.id),
          eq(importSessions.userId, this.ctx.user.id),
        ),
      )
      .groupBy(
        bookmarkLinks.crawlStatus,
        bookmarks.taggingStatus,
        bookmarks.lastIndexedAt,
      );

    const stats = {
      totalBookmarks: 0,
      completedBookmarks: 0,
      failedBookmarks: 0,
      pendingBookmarks: 0,
      processingBookmarks: 0,
      // Detailed progress breakdown
      crawlingPending: 0,
      crawlingCompleted: 0,
      crawlingFailed: 0,
      taggingPending: 0,
      taggingCompleted: 0,
      taggingFailed: 0,
      indexingPending: 0,
      indexingCompleted: 0,
    };

    statusCounts.forEach((statusCount) => {
      const { crawlStatus, taggingStatus, lastIndexedAt, count } = statusCount;

      stats.totalBookmarks += count;

      // Track crawling status
      if (crawlStatus === "pending") {
        stats.crawlingPending += count;
      } else if (crawlStatus === "success" || crawlStatus === null) {
        stats.crawlingCompleted += count;
      } else if (crawlStatus === "failure") {
        stats.crawlingFailed += count;
      }

      // Track tagging status
      if (taggingStatus === "pending") {
        stats.taggingPending += count;
      } else if (taggingStatus === "success") {
        stats.taggingCompleted += count;
      } else if (taggingStatus === "failure") {
        stats.taggingFailed += count;
      }

      // Track indexing status
      if (lastIndexedAt) {
        stats.indexingCompleted += count;
      } else {
        stats.indexingPending += count;
      }

      // Overall status calculation
      const isCrawlFailure = crawlStatus === "failure";
      const isTagFailure = taggingStatus === "failure";
      if (isCrawlFailure || isTagFailure) {
        stats.failedBookmarks += count;
        return;
      }

      const isCrawlPending = crawlStatus === "pending";
      const isTagPending = taggingStatus === "pending";
      const isIndexPending = !lastIndexedAt;
      if (isCrawlPending || isTagPending || isIndexPending) {
        stats.pendingBookmarks += count;
        return;
      }

      const isCrawlSuccessfulOrNotRequired =
        crawlStatus === "success" || crawlStatus === null;
      const isTagSuccessfulOrUnknown =
        taggingStatus === "success" || taggingStatus === null;
      const isIndexed = !!lastIndexedAt;

      if (
        isCrawlSuccessfulOrNotRequired &&
        isTagSuccessfulOrUnknown &&
        isIndexed
      ) {
        stats.completedBookmarks += count;
      } else {
        // Fallback to pending to avoid leaving imports unclassified
        stats.pendingBookmarks += count;
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
