/**
 * EXAMPLE: Privacy-Safe Highlight Model
 *
 * This file demonstrates how to migrate a model to use the privacy-by-construction
 * type system. Compare with the original highlights.ts to see the differences.
 *
 * KEY IMPROVEMENTS:
 * 1. No way to create a Highlight without verification
 * 2. Methods that require ownership use type constraints
 * 3. The `getForBookmark` bug is fixed by design - can't return unverified data
 */

import { TRPCError } from "@trpc/server";
import { and, desc, eq, like, lt, lte, or } from "drizzle-orm";
import { z } from "zod";

import { highlights } from "@karakeep/db/schema";
import {
  zHighlightSchema,
  zNewHighlightSchema,
  zUpdateHighlightSchema,
} from "@karakeep/shared/types/highlights";
import { zCursorV2 } from "@karakeep/shared/types/pagination";

import { AuthedContext } from "..";
import { HasAccess, VerifiedResource } from "../lib/privacy";
import { BareBookmark } from "./bookmarks";

// =============================================================================
// Type Definitions
// =============================================================================

type HighlightData = typeof highlights.$inferSelect;

// =============================================================================
// Privacy-Safe Highlight Model
// =============================================================================

/**
 * A Highlight that has been verified for access.
 *
 * PRIVACY GUARANTEES:
 * - Cannot be instantiated without verifying the user owns the highlight
 * - Methods that modify data require owner access (enforced by TypeScript)
 * - No bypass methods (fromData, etc.) exist
 */
export class VerifiedHighlight extends VerifiedResource<
  HighlightData,
  AuthedContext
> {
  // ===========================================================================
  // Factory Methods (The ONLY way to create instances)
  // ===========================================================================

  /**
   * Get a highlight by ID, verifying the user owns it.
   *
   * @throws TRPCError with code "NOT_FOUND" if highlight doesn't exist
   * @throws TRPCError with code "FORBIDDEN" if user doesn't own the highlight
   */
  static async fromId(
    ctx: AuthedContext,
    id: string,
  ): Promise<VerifiedHighlight> {
    const data = await ctx.db.query.highlights.findFirst({
      where: eq(highlights.id, id),
    });

    if (!data) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Highlight not found",
      });
    }

    // Verify ownership - this is the ONLY path to create a VerifiedHighlight
    if (data.userId !== ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to access this highlight",
      });
    }

    // User owns this highlight - create with "owner" access level
    return new VerifiedHighlight(ctx, data, "owner");
  }

  /**
   * Get all highlights for a bookmark that the CURRENT USER owns.
   *
   * PRIVACY FIX: Unlike the original getForBookmark, this ALWAYS filters
   * by the current user's ID, preventing cross-user highlight leakage.
   *
   * @param bookmark - A verified bookmark (access already checked)
   * @returns Only the current user's highlights on this bookmark
   */
  static async getForBookmark(
    ctx: AuthedContext,
    bookmark: BareBookmark,
  ): Promise<VerifiedHighlight[]> {
    // 🔒 CRITICAL: Always filter by current user's ID
    // This prevents leaking other users' highlights on shared bookmarks
    const results = await ctx.db.query.highlights.findMany({
      where: and(
        eq(highlights.bookmarkId, bookmark.id),
        eq(highlights.userId, ctx.user.id), // ← THE FIX: Always filter by user
      ),
      orderBy: [desc(highlights.createdAt), desc(highlights.id)],
    });

    // All results are owned by the current user, so access level is "owner"
    return results.map((h) => new VerifiedHighlight(ctx, h, "owner"));
  }

  /**
   * Get all highlights owned by the current user.
   */
  static async getAll(
    ctx: AuthedContext,
    cursor?: z.infer<typeof zCursorV2> | null,
    limit = 50,
  ): Promise<{
    highlights: VerifiedHighlight[];
    nextCursor: z.infer<typeof zCursorV2> | null;
  }> {
    const results = await ctx.db.query.highlights.findMany({
      where: and(
        eq(highlights.userId, ctx.user.id),
        cursor
          ? or(
              lt(highlights.createdAt, cursor.createdAt),
              and(
                eq(highlights.createdAt, cursor.createdAt),
                lte(highlights.id, cursor.id),
              ),
            )
          : undefined,
      ),
      limit: limit + 1,
      orderBy: [desc(highlights.createdAt), desc(highlights.id)],
    });

    let nextCursor: z.infer<typeof zCursorV2> | null = null;
    if (results.length > limit) {
      const nextItem = results.pop()!;
      nextCursor = {
        id: nextItem.id,
        createdAt: nextItem.createdAt,
      };
    }

    return {
      highlights: results.map((h) => new VerifiedHighlight(ctx, h, "owner")),
      nextCursor,
    };
  }

  /**
   * Search highlights owned by the current user.
   */
  static async search(
    ctx: AuthedContext,
    searchText: string,
    cursor?: z.infer<typeof zCursorV2> | null,
    limit = 50,
  ): Promise<{
    highlights: VerifiedHighlight[];
    nextCursor: z.infer<typeof zCursorV2> | null;
  }> {
    const searchPattern = `%${searchText}%`;
    const results = await ctx.db.query.highlights.findMany({
      where: and(
        eq(highlights.userId, ctx.user.id),
        or(
          like(highlights.text, searchPattern),
          like(highlights.note, searchPattern),
        ),
        cursor
          ? or(
              lt(highlights.createdAt, cursor.createdAt),
              and(
                eq(highlights.createdAt, cursor.createdAt),
                lte(highlights.id, cursor.id),
              ),
            )
          : undefined,
      ),
      limit: limit + 1,
      orderBy: [desc(highlights.createdAt), desc(highlights.id)],
    });

    let nextCursor: z.infer<typeof zCursorV2> | null = null;
    if (results.length > limit) {
      const nextItem = results.pop()!;
      nextCursor = {
        id: nextItem.id,
        createdAt: nextItem.createdAt,
      };
    }

    return {
      highlights: results.map((h) => new VerifiedHighlight(ctx, h, "owner")),
      nextCursor,
    };
  }

  /**
   * Create a new highlight.
   * The creator automatically becomes the owner.
   */
  static async create(
    ctx: AuthedContext,
    input: z.infer<typeof zNewHighlightSchema>,
  ): Promise<VerifiedHighlight> {
    const [result] = await ctx.db
      .insert(highlights)
      .values({
        bookmarkId: input.bookmarkId,
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        color: input.color,
        text: input.text,
        note: input.note,
        userId: ctx.user.id,
      })
      .returning();

    // Creator is always the owner
    return new VerifiedHighlight(ctx, result, "owner");
  }

  // ===========================================================================
  // Read Methods (No special access required - verification already done)
  // ===========================================================================

  /**
   * Get the public representation of this highlight.
   * Safe to call on any verified highlight.
   */
  asPublicHighlight(): z.infer<typeof zHighlightSchema> {
    return this.data;
  }

  // ===========================================================================
  // Write Methods (Require Owner Access - Enforced by TypeScript)
  // ===========================================================================

  /**
   * Delete this highlight.
   *
   * TYPE CONSTRAINT: The `this` parameter type ensures this method can only
   * be called on a VerifiedHighlight with owner access. If you try to call
   * this on a viewer/editor-level highlight, TypeScript will error.
   *
   * @example
   * ```typescript
   * const highlight = await VerifiedHighlight.fromId(ctx, id);
   *
   * // This works because fromId always returns owner-level access:
   * await highlight.delete();
   *
   * // But if we had viewer access (hypothetically):
   * const viewerHighlight: VerifiedHighlight & HasAccess<"viewer"> = ...;
   * await viewerHighlight.delete(); // ❌ TypeScript Error!
   * ```
   */
  async delete(
    this: VerifiedHighlight & HasAccess<"owner">,
  ): Promise<z.infer<typeof zHighlightSchema>> {
    const result = await this.ctx.db
      .delete(highlights)
      .where(
        and(
          eq(highlights.id, this.data.id),
          eq(highlights.userId, this.ctx.user.id),
        ),
      )
      .returning();

    if (result.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    return result[0];
  }

  /**
   * Update this highlight.
   *
   * TYPE CONSTRAINT: Requires owner access (see delete() for explanation).
   */
  async update(
    this: VerifiedHighlight & HasAccess<"owner">,
    input: z.infer<typeof zUpdateHighlightSchema>,
  ): Promise<void> {
    const result = await this.ctx.db
      .update(highlights)
      .set({
        color: input.color,
        note: input.note,
      })
      .where(
        and(
          eq(highlights.id, this.data.id),
          eq(highlights.userId, this.ctx.user.id),
        ),
      )
      .returning();

    if (result.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    // Update internal state
    // Note: We're using Object.assign to update the readonly data
    // This is intentional - we want the data to be readonly from outside
    Object.assign(this.data, result[0]);
  }
}

// =============================================================================
// Migration Notes
// =============================================================================

/**
 * HOW TO MIGRATE AN EXISTING MODEL:
 *
 * 1. Create a new class extending VerifiedResource<DataType, ContextType>
 *
 * 2. Make the constructor protected (inherited from VerifiedResource)
 *
 * 3. Create static factory methods that:
 *    - Fetch data from the database
 *    - Verify access (ownership, collaboration, etc.)
 *    - Return new instance with appropriate access level
 *
 * 4. Remove any `fromData()` methods that bypass verification
 *
 * 5. Add `this` parameter types to methods requiring specific access:
 *    - `delete(this: MyModel & HasAccess<"owner">): Promise<void>`
 *    - `update(this: MyModel & HasAccess<"editor">): Promise<void>`
 *
 * 6. Update router/middleware to use the new model
 *
 * BENEFITS:
 * - Compile-time enforcement of access checks
 * - Impossible to forget privacy checks
 * - Self-documenting code (method signatures show required access)
 * - No runtime overhead (types are erased)
 */
