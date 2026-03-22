import { and, count, eq, gt } from "drizzle-orm";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import { importSessions, importStagingBookmarks } from "@karakeep/db/schema";
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
