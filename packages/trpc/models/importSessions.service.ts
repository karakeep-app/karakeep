import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import type { importSessions } from "@karakeep/db/schema";
import {
  zCreateImportSessionRequestSchema,
  ZImportSessionWithStats,
} from "@karakeep/shared/types/importSessions";

import type { Actor, Authorized } from "../lib/actor";
import { actorUserId, assertOwnership, authorize } from "../lib/actor";
import { ImportSessionsRepo } from "./importSessions.repo";

type ImportSessionRow = typeof importSessions.$inferSelect;

export class ImportSessionsService {
  private repo: ImportSessionsRepo;

  constructor(db: DB) {
    this.repo = new ImportSessionsRepo(db);
  }

  async create(
    actor: Actor,
    input: z.infer<typeof zCreateImportSessionRequestSchema>,
  ): Promise<ImportSessionRow> {
    return await this.repo.create(actorUserId(actor), input);
  }

  async get(
    actor: Actor,
    sessionId: string,
  ): Promise<Authorized<ImportSessionRow>> {
    const session = await this.repo.get(sessionId);
    if (!session) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Import session not found",
      });
    }
    return authorize(session, () =>
      assertOwnership(actor, session.userId, {
        notFoundOnDeny: true,
        notFoundMessage: "Import session not found",
      }),
    );
  }

  async getWithStats(
    session: Authorized<ImportSessionRow>,
  ): Promise<ZImportSessionWithStats> {
    return await this.buildStats(session);
  }

  async listWithStats(actor: Actor): Promise<ZImportSessionWithStats[]> {
    const sessions = await this.repo.getAll(actorUserId(actor));
    return await Promise.all(
      sessions.map((session) => this.buildStats(session)),
    );
  }

  async delete(session: Authorized<ImportSessionRow>): Promise<void> {
    const deleted = await this.repo.delete(session.id);

    if (!deleted) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Import session not found",
      });
    }
  }

  async stageBookmarks(
    session: Authorized<ImportSessionRow>,
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

  async finalize(session: Authorized<ImportSessionRow>): Promise<void> {
    if (session.status !== "staging") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Session not in staging status",
      });
    }

    await this.repo.updateStatus(session.id, "pending");
  }

  async pause(session: Authorized<ImportSessionRow>): Promise<void> {
    if (!["pending", "running"].includes(session.status)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Session cannot be paused in current status",
      });
    }

    await this.repo.updateStatus(session.id, "paused");
  }

  async resume(session: Authorized<ImportSessionRow>): Promise<void> {
    if (session.status !== "paused") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Session not paused",
      });
    }

    await this.repo.updateStatus(session.id, "pending");
  }

  async getStagingBookmarks(
    session: Authorized<ImportSessionRow>,
    filter?: "all" | "accepted" | "rejected" | "skipped_duplicate" | "pending",
    cursor?: string,
    limit = 50,
  ) {
    return await this.repo.getStagingBookmarks(
      session.id,
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
