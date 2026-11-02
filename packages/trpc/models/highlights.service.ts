import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import {
  zHighlightSchema,
  zNewHighlightSchema,
  zUpdateHighlightSchema,
} from "@karakeep/shared/types/highlights";
import { zCursorV2 } from "@karakeep/shared/types/pagination";

import type { Actor, Authorized } from "../lib/actor";
import { actorUserId, assertOwnership, authorize } from "../lib/actor";
import { HighlightsRepo } from "./highlights.repo";

type Highlight = z.infer<typeof zHighlightSchema>;

export class HighlightsService {
  private repo: HighlightsRepo;

  constructor(db: DB) {
    this.repo = new HighlightsRepo(db);
  }

  async get(actor: Actor, id: string): Promise<Authorized<Highlight>> {
    const highlight = await this.repo.get(id);
    if (!highlight) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Highlight not found",
      });
    }
    return authorize(highlight, () => assertOwnership(actor, highlight.userId));
  }

  async create(
    actor: Actor,
    input: z.infer<typeof zNewHighlightSchema>,
  ): Promise<Highlight> {
    return await this.repo.create(actorUserId(actor), input);
  }

  async getForBookmark(actor: Actor, bookmarkId: string): Promise<Highlight[]> {
    const highlights = await this.repo.getForBookmark(bookmarkId);
    const userId = actorUserId(actor);
    // Collaborators on a shared list can see the highlighted text, but the
    // note is the author's personal annotation, like a bookmark's note (see
    // Bookmark.asZBookmark), so only its author gets it.
    return highlights.map((highlight) =>
      highlight.userId === userId ? highlight : { ...highlight, note: null },
    );
  }

  async getAll(
    actor: Actor,
    cursor?: z.infer<typeof zCursorV2> | null,
    limit = 50,
  ): Promise<{
    highlights: Highlight[];
    nextCursor: z.infer<typeof zCursorV2> | null;
  }> {
    return await this.repo.getAll(actorUserId(actor), cursor, limit);
  }

  async search(
    actor: Actor,
    searchText: string,
    cursor?: z.infer<typeof zCursorV2> | null,
    limit = 50,
  ): Promise<{
    highlights: Highlight[];
    nextCursor: z.infer<typeof zCursorV2> | null;
  }> {
    return await this.repo.search(
      actorUserId(actor),
      searchText,
      cursor,
      limit,
    );
  }

  async delete(highlight: Authorized<Highlight>): Promise<Highlight> {
    const deleted = await this.repo.delete(highlight.id);
    if (!deleted) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return deleted;
  }

  async update(
    highlight: Authorized<Highlight>,
    input: z.infer<typeof zUpdateHighlightSchema>,
  ): Promise<Highlight> {
    const updated = await this.repo.update(highlight.id, input);
    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return updated;
  }
}
