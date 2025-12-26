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
import { HasAccess, VerifiedResource } from "../lib/privacy";

/**
 * Privacy-safe ImportSession model using VerifiedResource pattern.
 *
 * Import sessions are always owned by a single user (no sharing).
 * All verified import sessions have "owner" access level.
 */
export class ImportSession extends VerifiedResource<
  ZImportSession,
  AuthedContext
> {
  protected constructor(ctx: AuthedContext, session: ZImportSession) {
    // Import sessions are always owner-only (no collaboration)
    super(ctx, session, "owner");
  }

  protected get session() {
    return this.data;
  }

  get id() {
    return this.session.id;
  }

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
    // Get bookmark counts by status
    const statusCounts = await this.ctx.db
      .select({
        crawlStatus: bookmarkLinks.crawlStatus,
        taggingStatus: bookmarks.taggingStatus,
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
      .groupBy(bookmarkLinks.crawlStatus, bookmarks.taggingStatus);

    const stats = {
      totalBookmarks: 0,
      completedBookmarks: 0,
      failedBookmarks: 0,
      pendingBookmarks: 0,
      processingBookmarks: 0,
    };

    statusCounts.forEach((statusCount) => {
      const { crawlStatus, taggingStatus, count } = statusCount;

      stats.totalBookmarks += count;

      const isCrawlFailure = crawlStatus === "failure";
      const isTagFailure = taggingStatus === "failure";
      if (isCrawlFailure || isTagFailure) {
        stats.failedBookmarks += count;
        return;
      }

      const isCrawlPending = crawlStatus === "pending";
      const isTagPending = taggingStatus === "pending";
      if (isCrawlPending || isTagPending) {
        stats.pendingBookmarks += count;
        return;
      }

      const isCrawlSuccessfulOrNotRequired =
        crawlStatus === "success" || crawlStatus === null;
      const isTagSuccessfulOrUnknown =
        taggingStatus === "success" || taggingStatus === null;

      if (isCrawlSuccessfulOrNotRequired && isTagSuccessfulOrUnknown) {
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

  /**
   * Delete this import session.
   * TYPE CONSTRAINT: Requires owner access (always satisfied for import sessions).
   */
  async delete(this: ImportSession & HasAccess<"owner">): Promise<void> {
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
