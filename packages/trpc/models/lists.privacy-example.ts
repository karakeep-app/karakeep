/**
 * EXAMPLE: Privacy-Safe List Model with Multiple Access Levels
 *
 * This demonstrates the privacy type system for resources with hierarchical
 * access levels (owner > editor > viewer). The List model is more complex
 * than Highlight because:
 *
 * 1. Access can come from ownership OR collaboration
 * 2. Different methods require different access levels
 * 3. Some data is hidden from non-owners
 *
 * KEY CONCEPTS DEMONSTRATED:
 * - Access level hierarchy in types
 * - Method constraints based on access level
 * - Type-safe data hiding for non-owners
 */

import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import invariant from "tiny-invariant";
import { z } from "zod";

import {
  bookmarkLists,
  bookmarksInLists,
  listCollaborators,
} from "@karakeep/db/schema";
import {
  ZBookmarkList,
  zEditBookmarkListSchemaWithValidation,
  zNewBookmarkListSchema,
} from "@karakeep/shared/types/lists";

import { AuthedContext } from "..";
import {
  AccessLevel,
  HasAccess,
  VerifiedResource,
} from "../lib/privacy";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * The full list data including sensitive fields.
 */
interface ListData extends ZBookmarkList {
  userId: string;
  rssToken?: string | null;
}

/**
 * The public representation of a list.
 * Sensitive fields are removed or hidden based on access level.
 */
interface PublicListData {
  id: string;
  name: string;
  description: string | null | undefined;
  icon: string;
  type: "manual" | "smart";
  query: string | null | undefined;
  userRole: AccessLevel | "public";
  hasCollaborators: boolean;
  // These are hidden from non-owners:
  parentId: string | null | undefined;
  public: boolean;
}

// =============================================================================
// Privacy-Safe List Model
// =============================================================================

/**
 * A List that has been verified for access.
 *
 * ACCESS LEVEL HIERARCHY:
 * - owner:  Full control (delete, manage collaborators, RSS tokens)
 * - editor: Can add/remove bookmarks
 * - viewer: Can only view list contents
 *
 * TYPE SAFETY:
 * Methods specify their required access level via the `this` parameter.
 * TypeScript ensures you can't call owner-only methods without proving access.
 */
export abstract class VerifiedList extends VerifiedResource<
  ListData,
  AuthedContext
> {
  // For collaborators, store their membership ID
  protected collaboratorEntry: { membershipId: string } | null;

  protected constructor(
    ctx: AuthedContext,
    data: ListData,
    accessLevel: AccessLevel,
    collaboratorEntry: { membershipId: string } | null,
  ) {
    super(ctx, data, accessLevel);
    this.collaboratorEntry = collaboratorEntry;
  }

  // ===========================================================================
  // Factory Methods
  // ===========================================================================

  /**
   * Get a list by ID, determining access level from ownership or collaboration.
   */
  static async fromId(
    ctx: AuthedContext,
    id: string,
  ): Promise<VerifiedManualList | VerifiedSmartList> {
    // First, check if user owns the list
    const ownedList = await ctx.db.query.bookmarkLists.findFirst({
      columns: { rssToken: false },
      where: and(
        eq(bookmarkLists.id, id),
        eq(bookmarkLists.userId, ctx.user.id),
      ),
      with: {
        collaborators: {
          columns: { id: true },
          limit: 1,
        },
      },
    });

    if (ownedList) {
      // User owns this list - full owner access
      const data: ListData = {
        ...ownedList,
        userRole: "owner",
        hasCollaborators: ownedList.collaborators.length > 0,
      };
      return VerifiedList.createInstance(ctx, data, "owner", null);
    }

    // Check if user is a collaborator
    const collaboration = await ctx.db.query.listCollaborators.findFirst({
      where: and(
        eq(listCollaborators.listId, id),
        eq(listCollaborators.userId, ctx.user.id),
      ),
      with: {
        list: {
          columns: { rssToken: false },
        },
      },
    });

    if (collaboration) {
      // User is a collaborator
      const data: ListData = {
        ...collaboration.list,
        userRole: collaboration.role,
        hasCollaborators: true,
      };
      const accessLevel: AccessLevel =
        collaboration.role === "viewer" ? "viewer" : "editor";
      return VerifiedList.createInstance(ctx, data, accessLevel, {
        membershipId: collaboration.id,
      });
    }

    // No access
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "List not found",
    });
  }

  /**
   * Create the appropriate subclass based on list type.
   */
  private static createInstance(
    ctx: AuthedContext,
    data: ListData,
    accessLevel: AccessLevel,
    collaboratorEntry: { membershipId: string } | null,
  ): VerifiedManualList | VerifiedSmartList {
    if (data.type === "smart") {
      return new VerifiedSmartList(ctx, data, accessLevel, collaboratorEntry);
    } else {
      return new VerifiedManualList(ctx, data, accessLevel, collaboratorEntry);
    }
  }

  /**
   * Create a new list. Creator becomes owner.
   */
  static async create(
    ctx: AuthedContext,
    input: z.infer<typeof zNewBookmarkListSchema>,
  ): Promise<VerifiedManualList | VerifiedSmartList> {
    const [result] = await ctx.db
      .insert(bookmarkLists)
      .values({
        name: input.name,
        description: input.description,
        icon: input.icon,
        userId: ctx.user.id,
        parentId: input.parentId,
        type: input.type,
        query: input.query,
      })
      .returning();

    const data: ListData = {
      ...result,
      userRole: "owner",
      hasCollaborators: false,
    };

    return VerifiedList.createInstance(ctx, data, "owner", null);
  }

  // ===========================================================================
  // Read Methods (Available to all verified access levels)
  // ===========================================================================

  get id(): string {
    return this.data.id;
  }

  get type(): "manual" | "smart" {
    return this.data.type;
  }

  /**
   * Get the public representation of this list.
   *
   * PRIVACY FEATURE: Automatically hides sensitive fields for non-owners.
   * The type system doesn't enforce this (it's runtime), but the method
   * is always safe to call.
   */
  asPublicList(): PublicListData {
    if (this.isOwner()) {
      // Owner sees everything
      return {
        id: this.data.id,
        name: this.data.name,
        description: this.data.description,
        icon: this.data.icon,
        type: this.data.type,
        query: this.data.query,
        userRole: this.data.userRole,
        hasCollaborators: this.data.hasCollaborators,
        parentId: this.data.parentId,
        public: this.data.public,
      };
    }

    // Non-owners see limited data
    return {
      id: this.data.id,
      name: this.data.name,
      description: this.data.description,
      icon: this.data.icon,
      type: this.data.type,
      query: this.data.query,
      userRole: this.data.userRole,
      hasCollaborators: this.data.hasCollaborators,
      // Hide sensitive fields
      parentId: null,
      public: false,
    };
  }

  // ===========================================================================
  // Editor-Level Methods
  // ===========================================================================

  /**
   * Add a bookmark to this list.
   *
   * TYPE CONSTRAINT: Requires at least editor access.
   */
  abstract addBookmark(
    this: VerifiedList & HasAccess<"editor">,
    bookmarkId: string,
  ): Promise<void>;

  /**
   * Remove a bookmark from this list.
   *
   * TYPE CONSTRAINT: Requires at least editor access.
   */
  abstract removeBookmark(
    this: VerifiedList & HasAccess<"editor">,
    bookmarkId: string,
  ): Promise<void>;

  // ===========================================================================
  // Owner-Only Methods
  // ===========================================================================

  /**
   * Delete this list.
   *
   * TYPE CONSTRAINT: Requires owner access.
   *
   * @example
   * ```typescript
   * const list = await VerifiedList.fromId(ctx, id);
   *
   * // Must prove ownership before calling delete:
   * if (list.isOwner()) {
   *   await list.delete(); // ✅ TypeScript knows we have owner access
   * }
   *
   * // Or use requireOwner() which throws:
   * await list.requireOwner().delete();
   *
   * // This would be a TypeScript error:
   * // await list.delete(); // ❌ Error: list might not be owner-level
   * ```
   */
  async delete(this: VerifiedList & HasAccess<"owner">): Promise<void> {
    const res = await this.ctx.db
      .delete(bookmarkLists)
      .where(
        and(
          eq(bookmarkLists.id, this.data.id),
          eq(bookmarkLists.userId, this.ctx.user.id),
        ),
      );

    if (res.changes === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
  }

  /**
   * Update list metadata.
   *
   * TYPE CONSTRAINT: Requires owner access.
   */
  async update(
    this: VerifiedList & HasAccess<"owner">,
    input: z.infer<typeof zEditBookmarkListSchemaWithValidation>,
  ): Promise<void> {
    const result = await this.ctx.db
      .update(bookmarkLists)
      .set({
        name: input.name,
        description: input.description,
        icon: input.icon,
        parentId: input.parentId,
        query: input.query,
        public: input.public,
      })
      .where(
        and(
          eq(bookmarkLists.id, this.data.id),
          eq(bookmarkLists.userId, this.ctx.user.id),
        ),
      )
      .returning();

    if (result.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    // Update internal state
    Object.assign(this.data, result[0]);
  }

  /**
   * Regenerate the RSS token for this list.
   *
   * TYPE CONSTRAINT: Requires owner access.
   */
  async regenRssToken(this: VerifiedList & HasAccess<"owner">): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    const result = await this.ctx.db
      .update(bookmarkLists)
      .set({ rssToken: token })
      .where(
        and(
          eq(bookmarkLists.id, this.data.id),
          eq(bookmarkLists.userId, this.ctx.user.id),
        ),
      )
      .returning();

    if (result.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    return token;
  }

  /**
   * Add a collaborator to this list.
   *
   * TYPE CONSTRAINT: Requires owner access.
   */
  async addCollaborator(
    this: VerifiedList & HasAccess<"owner">,
    email: string,
    role: "viewer" | "editor",
  ): Promise<string> {
    // Implementation would create an invitation...
    throw new Error("Not implemented in example");
  }

  /**
   * Remove a collaborator from this list.
   *
   * TYPE CONSTRAINT: Requires owner access.
   */
  async removeCollaborator(
    this: VerifiedList & HasAccess<"owner">,
    userId: string,
  ): Promise<void> {
    const result = await this.ctx.db
      .delete(listCollaborators)
      .where(
        and(
          eq(listCollaborators.listId, this.data.id),
          eq(listCollaborators.userId, userId),
        ),
      );

    if (result.changes === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Collaborator not found",
      });
    }
  }

  // ===========================================================================
  // Abstract Methods (Implemented by Subclasses)
  // ===========================================================================

  abstract getBookmarkIds(): Promise<string[]>;
  abstract getSize(): Promise<number>;
}

// =============================================================================
// Manual List Implementation
// =============================================================================

export class VerifiedManualList extends VerifiedList {
  override get type(): "manual" {
    return "manual";
  }

  async getBookmarkIds(): Promise<string[]> {
    const results = await this.ctx.db
      .select({ id: bookmarksInLists.bookmarkId })
      .from(bookmarksInLists)
      .where(eq(bookmarksInLists.listId, this.data.id));
    return results.map((r) => r.id);
  }

  async getSize(): Promise<number> {
    return (await this.getBookmarkIds()).length;
  }

  /**
   * Add a bookmark to this manual list.
   *
   * TYPE CONSTRAINT: Requires at least editor access.
   */
  async addBookmark(
    this: VerifiedManualList & HasAccess<"editor">,
    bookmarkId: string,
  ): Promise<void> {
    try {
      await this.ctx.db.insert(bookmarksInLists).values({
        listId: this.data.id,
        bookmarkId,
        listMembershipId: this.collaboratorEntry?.membershipId,
      });
    } catch (e) {
      // Handle duplicate key error
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to add bookmark to list",
      });
    }
  }

  /**
   * Remove a bookmark from this manual list.
   *
   * TYPE CONSTRAINT: Requires at least editor access.
   */
  async removeBookmark(
    this: VerifiedManualList & HasAccess<"editor">,
    bookmarkId: string,
  ): Promise<void> {
    const deleted = await this.ctx.db
      .delete(bookmarksInLists)
      .where(
        and(
          eq(bookmarksInLists.listId, this.data.id),
          eq(bookmarksInLists.bookmarkId, bookmarkId),
        ),
      );

    if (deleted.changes === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Bookmark ${bookmarkId} is not in list ${this.data.id}`,
      });
    }
  }
}

// =============================================================================
// Smart List Implementation
// =============================================================================

export class VerifiedSmartList extends VerifiedList {
  override get type(): "smart" {
    return "smart";
  }

  get query(): string {
    invariant(this.data.query, "Smart list must have a query");
    return this.data.query;
  }

  async getBookmarkIds(): Promise<string[]> {
    // Would parse query and execute search...
    throw new Error("Not implemented in example");
  }

  async getSize(): Promise<number> {
    return (await this.getBookmarkIds()).length;
  }

  /**
   * Smart lists cannot have bookmarks added manually.
   */
  addBookmark(
    this: VerifiedSmartList & HasAccess<"editor">,
    _bookmarkId: string,
  ): Promise<void> {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot add bookmarks to smart lists",
    });
  }

  /**
   * Smart lists cannot have bookmarks removed manually.
   */
  removeBookmark(
    this: VerifiedSmartList & HasAccess<"editor">,
    _bookmarkId: string,
  ): Promise<void> {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot remove bookmarks from smart lists",
    });
  }
}

// =============================================================================
// Router Usage Example
// =============================================================================

/**
 * Example of how routers would use the privacy-safe List model.
 *
 * @example
 * ```typescript
 * // In router definition:
 * const listsRouter = router({
 *   // Read operation - any access level works
 *   get: authedProcedure
 *     .input(z.object({ listId: z.string() }))
 *     .query(async ({ input, ctx }) => {
 *       const list = await VerifiedList.fromId(ctx, input.listId);
 *       return list.asPublicList(); // Safe for any access level
 *     }),
 *
 *   // Delete operation - requires owner access
 *   delete: authedProcedure
 *     .input(z.object({ listId: z.string() }))
 *     .mutation(async ({ input, ctx }) => {
 *       const list = await VerifiedList.fromId(ctx, input.listId);
 *       // Option 1: Use requireOwner() which throws if not owner
 *       await list.requireOwner().delete();
 *
 *       // Option 2: Use type guard for custom error handling
 *       // if (!list.isOwner()) {
 *       //   throw new TRPCError({ code: "FORBIDDEN", message: "Must be owner" });
 *       // }
 *       // await list.delete();
 *     }),
 *
 *   // Add bookmark - requires editor access
 *   addBookmark: authedProcedure
 *     .input(z.object({ listId: z.string(), bookmarkId: z.string() }))
 *     .mutation(async ({ input, ctx }) => {
 *       const list = await VerifiedList.fromId(ctx, input.listId);
 *       // requireEditor() throws if access < editor
 *       await list.requireEditor().addBookmark(input.bookmarkId);
 *     }),
 * });
 * ```
 */
