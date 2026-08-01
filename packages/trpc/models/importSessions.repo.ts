import { and, count, eq, gt, lte } from "drizzle-orm";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import {
  importSessionBookmarks,
  importSessions,
  importStagingBookmarks,
} from "@karakeep/db/schema";
import {
  zCreateImportSessionRequestSchema,
  ZImportSession,
} from "@karakeep/shared/types/importSessions";

type ImportSessionRow = typeof importSessions.$inferSelect;
type StagingBookmarkRow = typeof importStagingBookmarks.$inferSelect;

export class ImportSessionsRepo {
  constructor(private db: DB) {}

  async get(id: string): Promise<ImportSessionRow | null> {
    const session = await this.db.query.importSessions.findFirst({
      where: eq(importSessions.id, id),
    });
    return session ?? null;
  }

  async create(
    userId: string,
    input: z.infer<typeof zCreateImportSessionRequestSchema>,
  ): Promise<ImportSessionRow> {
    const [session] = await this.db
      .insert(importSessions)
      .values({
        name: input.name,
        userId,
        rootListId: input.rootListId,
      })
      .returning();

    return session;
  }

  async getAll(userId: string): Promise<ImportSessionRow[]> {
    return await this.db.query.importSessions.findMany({
      where: eq(importSessions.userId, userId),
      orderBy: (importSessions, { desc }) => [desc(importSessions.createdAt)],
      limit: 50,
    });
  }

  async getStatusCounts(
    sessionId: string,
  ): Promise<{ status: string; count: number }[]> {
    return await this.db
      .select({
        status: importStagingBookmarks.status,
        count: count(),
      })
      .from(importStagingBookmarks)
      .where(eq(importStagingBookmarks.importSessionId, sessionId))
      .groupBy(importStagingBookmarks.status);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(importSessions)
      .where(eq(importSessions.id, id));
    return result.changes > 0;
  }

  async insertStagingBookmarks(
    bookmarks: {
      importSessionId: string;
      type: "link" | "text" | "asset";
      url?: string;
      title?: string;
      content?: string;
      note?: string;
      tags: string[];
      listIds: string[];
      sourceAddedAt?: Date;
      archived?: boolean;
      status: "pending";
    }[],
  ): Promise<void> {
    await this.db.insert(importStagingBookmarks).values(bookmarks);
  }

  async updateStatus(
    id: string,
    status: ZImportSession["status"],
  ): Promise<void> {
    await this.db
      .update(importSessions)
      .set({ status })
      .where(eq(importSessions.id, id));
  }

  async archiveCompleted(cutoff: Date): Promise<number> {
    const sessions = await this.db
      .select({ id: importSessions.id })
      .from(importSessions)
      .where(
        and(
          eq(importSessions.status, "completed"),
          lte(importSessions.completedAt, cutoff),
        ),
      );

    // One transaction per session to keep write locks short; a large backlog
    // (e.g. the first sweep after deploy) shouldn't block other writers.
    let archivedCount = 0;
    for (const session of sessions) {
      const archived = await this.db.transaction(async (tx) => {
        const statusCounts = await tx
          .select({
            status: importStagingBookmarks.status,
            count: count(),
          })
          .from(importStagingBookmarks)
          .where(eq(importStagingBookmarks.importSessionId, session.id))
          .groupBy(importStagingBookmarks.status);

        const stats = {
          totalBookmarks: 0,
          completedBookmarks: 0,
          failedBookmarks: 0,
          pendingBookmarks: 0,
          processingBookmarks: 0,
        };

        for (const { status, count: itemCount } of statusCounts) {
          stats.totalBookmarks += itemCount;
          switch (status) {
            case "pending":
              stats.pendingBookmarks += itemCount;
              break;
            case "processing":
              stats.processingBookmarks += itemCount;
              break;
            case "completed":
              stats.completedBookmarks += itemCount;
              break;
            case "failed":
              stats.failedBookmarks += itemCount;
              break;
          }
        }

        const result = await tx
          .update(importSessions)
          .set({ status: "archived", ...stats })
          .where(
            and(
              eq(importSessions.id, session.id),
              eq(importSessions.status, "completed"),
            ),
          );

        if (result.changes === 0) {
          return false;
        }

        await tx
          .delete(importStagingBookmarks)
          .where(eq(importStagingBookmarks.importSessionId, session.id));
        await tx
          .delete(importSessionBookmarks)
          .where(eq(importSessionBookmarks.importSessionId, session.id));
        return true;
      });

      if (archived) {
        archivedCount++;
      }
    }

    return archivedCount;
  }

  async getStagingBookmarks(
    sessionId: string,
    filter?: "all" | "accepted" | "rejected" | "skipped_duplicate" | "pending",
    cursor?: string,
    limit = 50,
  ): Promise<{ items: StagingBookmarkRow[]; nextCursor: string | null }> {
    const results = await this.db
      .select()
      .from(importStagingBookmarks)
      .where(
        and(
          eq(importStagingBookmarks.importSessionId, sessionId),
          filter && filter !== "all"
            ? filter === "pending"
              ? eq(importStagingBookmarks.status, "pending")
              : eq(importStagingBookmarks.result, filter)
            : undefined,
          cursor ? gt(importStagingBookmarks.id, cursor) : undefined,
        ),
      )
      .orderBy(importStagingBookmarks.id)
      .limit(limit + 1);

    const hasMore = results.length > limit;
    return {
      items: results.slice(0, limit),
      nextCursor: hasMore ? results[limit - 1].id : null,
    };
  }
}
