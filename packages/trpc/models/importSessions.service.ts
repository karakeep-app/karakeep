import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import type { importSessions } from "@karakeep/db/schema";
import {
  zCreateImportSessionRequestSchema,
  ZImportSessionWithStats,
} from "@karakeep/shared/types/importSessions";

import { ImportSessionsRepo } from "./importSessions.repo";

type ImportSessionRow = typeof importSessions.$inferSelect;

export class ImportSessionsService {
  private repo: ImportSessionsRepo;

  constructor(db: DB) {
    this.repo = new ImportSessionsRepo(db);
  }

  async create(
    userId: string,
    input: z.infer<typeof zCreateImportSessionRequestSchema>,
  ): Promise<ImportSessionRow> {
    return await this.repo.create(userId, input);
  }

  async get(sessionId: string, userId: string): Promise<ImportSessionRow> {
    const session = await this.repo.get(sessionId);

    if (!session || session.userId !== userId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Import session not found",
      });
    }

    return session;
  }

  async getWithStats(
    sessionId: string,
    userId: string,
  ): Promise<ZImportSessionWithStats> {
    const session = await this.get(sessionId, userId);
    return await this.buildStats(session);
  }

  async listWithStats(userId: string): Promise<ZImportSessionWithStats[]> {
    const sessions = await this.repo.getAll(userId);
    return await Promise.all(
      sessions.map((session) => this.buildStats(session)),
    );
  }

  async delete(sessionId: string, userId: string): Promise<void> {
    const deleted = await this.repo.delete(sessionId, userId);

    if (!deleted) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Import session not found",
      });
    }
  }

  async stageBookmarks(
    session: ImportSessionRow,
    bookmarks: {
      type: "link" | "text" | "asset";
      url?: string;
      title?: string;
      content?: string;
      note?: string;
      tags: string[];
      listIds: string[];
      sourceAddedAt?: Date;
    }[],
  ): Promise<void> {
    if (session.status !== "staging") {
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

    await this.repo.insertStagingBookmarks(
      validBookmarks.map((bookmark) => ({
        importSessionId: session.id,
        type: bookmark.type,
        url: bookmark.url,
        title: bookmark.title,
        content: bookmark.content,
        note: bookmark.note,
        tags: bookmark.tags,
        listIds: bookmark.listIds,
        sourceAddedAt: bookmark.sourceAddedAt,
        status: "pending" as const,
      })),
    );
  }

  async finalize(session: ImportSessionRow): Promise<void> {
    if (session.status !== "staging") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Session not in staging status",
      });
    }

    await this.repo.updateStatus(session.id, "pending");
  }

  async pause(session: ImportSessionRow): Promise<void> {
    if (!["pending", "running"].includes(session.status)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Session cannot be paused in current status",
      });
    }

    await this.repo.updateStatus(session.id, "paused");
  }

  async resume(session: ImportSessionRow): Promise<void> {
    if (session.status !== "paused") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Session not paused",
      });
    }

    await this.repo.updateStatus(session.id, "pending");
  }

  async getStagingBookmarks(
    sessionId: string,
    filter?: "all" | "accepted" | "rejected" | "skipped_duplicate" | "pending",
    cursor?: string,
    limit = 50,
  ) {
    return await this.repo.getStagingBookmarks(
      sessionId,
      filter,
      cursor,
      limit,
    );
  }

  private async buildStats(
    session: ImportSessionRow,
  ): Promise<ZImportSessionWithStats> {
    const statusCounts = await this.repo.getStatusCounts(session.id);

    const stats = {
      totalBookmarks: 0,
      completedBookmarks: 0,
      failedBookmarks: 0,
      pendingBookmarks: 0,
      processingBookmarks: 0,
    };

    statusCounts.forEach(({ status, count: itemCount }) => {
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
    });

    return {
      ...session,
      ...stats,
    };
  }
}
