import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import {
  zHighlightSchema,
  zNewHighlightSchema,
  zUpdateHighlightSchema,
} from "@karakeep/shared/types/highlights";
import { zCursorV2 } from "@karakeep/shared/types/pagination";

import { HighlightsRepo } from "./highlights.repo";

type Highlight = z.infer<typeof zHighlightSchema>;

export class HighlightsService {
  private repo: HighlightsRepo;

  constructor(db: DB) {
    this.repo = new HighlightsRepo(db);
  }

  async get(id: string): Promise<Highlight> {
    const highlight = await this.repo.get(id);
    if (!highlight) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Highlight not found",
      });
    }
    return highlight;
  }

  async create(
    userId: string,
    input: z.infer<typeof zNewHighlightSchema>,
  ): Promise<Highlight> {
    return await this.repo.create(userId, input);
  }

  async getForBookmark(bookmarkId: string): Promise<Highlight[]> {
    return await this.repo.getForBookmark(bookmarkId);
  }

  async getAll(
    userId: string,
    cursor?: z.infer<typeof zCursorV2> | null,
    limit = 50,
  ): Promise<{
    highlights: Highlight[];
    nextCursor: z.infer<typeof zCursorV2> | null;
  }> {
    return await this.repo.getAll(userId, cursor, limit);
  }

  async search(
    userId: string,
    searchText: string,
    cursor?: z.infer<typeof zCursorV2> | null,
    limit = 50,
  ): Promise<{
    highlights: Highlight[];
    nextCursor: z.infer<typeof zCursorV2> | null;
  }> {
    return await this.repo.search(userId, searchText, cursor, limit);
  }

  async delete(id: string): Promise<Highlight> {
    const deleted = await this.repo.delete(id);
    if (!deleted) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return deleted;
  }

  async update(
    id: string,
    input: z.infer<typeof zUpdateHighlightSchema>,
  ): Promise<Highlight> {
    const updated = await this.repo.update(id, input);
    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return updated;
  }
}
