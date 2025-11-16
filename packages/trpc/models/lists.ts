import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, count, eq, or } from "drizzle-orm";
import invariant from "tiny-invariant";
import { z } from "zod";

import { SqliteError } from "@karakeep/db";
import {
  bookmarkLists,
  bookmarksInLists,
  listCollaborators,
} from "@karakeep/db/schema";
import { triggerRuleEngineOnEvent } from "@karakeep/shared-server";
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";
import { ZSortOrder } from "@karakeep/shared/types/bookmarks";
import {
  ZBookmarkList,
  zEditBookmarkListSchemaWithValidation,
  zNewBookmarkListSchema,
} from "@karakeep/shared/types/lists";
import { ZCursor } from "@karakeep/shared/types/pagination";

import { AuthedContext, Context } from "..";
import { buildImpersonatingAuthedContext } from "../lib/impersonate";
import { getBookmarkIdsFromMatcher } from "../lib/search";
import { Bookmark } from "./bookmarks";
import { PrivacyAware } from "./privacy";

export abstract class List implements PrivacyAware {
  protected constructor(
    protected ctx: AuthedContext,
    public list: ZBookmarkList & { userId: string },
  ) {}

  private static fromData(
    ctx: AuthedContext,
    data: ZBookmarkList & { userId: string },
  ) {
    if (data.type === "smart") {
      return new SmartList(ctx, data);
    } else {
      return new ManualList(ctx, data);
    }
  }

  static async fromId(
    ctx: AuthedContext,
    id: string,
  ): Promise<ManualList | SmartList> {
    // First try to find the list owned by the user
    let list = await ctx.db.query.bookmarkLists.findFirst({
      where: and(
        eq(bookmarkLists.id, id),
        eq(bookmarkLists.userId, ctx.user.id),
      ),
    });

    // If not found, check if the user is a collaborator
    if (!list) {
      const collaborator = await ctx.db.query.listCollaborators.findFirst({
        where: and(
          eq(listCollaborators.listId, id),
          eq(listCollaborators.userId, ctx.user.id),
        ),
        with: {
          list: true,
        },
      });

      if (collaborator) {
        list = collaborator.list;
      }
    }

    if (!list) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "List not found",
      });
    }
    if (list.type === "smart") {
      return new SmartList(ctx, list);
    } else {
      return new ManualList(ctx, list);
    }
  }

  private static async getPublicList(
    ctx: Context,
    listId: string,
    token: string | null,
  ) {
    const listdb = await ctx.db.query.bookmarkLists.findFirst({
      where: and(
        eq(bookmarkLists.id, listId),
        or(
          eq(bookmarkLists.public, true),
          token !== null ? eq(bookmarkLists.rssToken, token) : undefined,
        ),
      ),
      with: {
        user: {
          columns: {
            name: true,
          },
        },
      },
    });
    if (!listdb) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "List not found",
      });
    }
    return listdb;
  }

  static async getPublicListMetadata(
    ctx: Context,
    listId: string,
    token: string | null,
  ) {
    const listdb = await this.getPublicList(ctx, listId, token);
    return {
      userId: listdb.userId,
      name: listdb.name,
      description: listdb.description,
      icon: listdb.icon,
      ownerName: listdb.user.name,
    };
  }

  static async getPublicListContents(
    ctx: Context,
    listId: string,
    token: string | null,
    pagination: {
      limit: number;
      order: Exclude<ZSortOrder, "relevance">;
      cursor: ZCursor | null | undefined;
    },
  ) {
    const listdb = await this.getPublicList(ctx, listId, token);

    // The token here acts as an authed context, so we can create
    // an impersonating context for the list owner as long as
    // we don't leak the context.
    const authedCtx = await buildImpersonatingAuthedContext(listdb.userId);
    const list = List.fromData(authedCtx, listdb);
    const bookmarkIds = await list.getBookmarkIds();

    const bookmarks = await Bookmark.loadMulti(authedCtx, {
      ids: bookmarkIds,
      includeContent: false,
      limit: pagination.limit,
      sortOrder: pagination.order,
      cursor: pagination.cursor,
    });

    return {
      list: {
        icon: list.list.icon,
        name: list.list.name,
        description: list.list.description,
        ownerName: listdb.user.name,
        numItems: bookmarkIds.length,
      },
      bookmarks: bookmarks.bookmarks.map((b) => b.asPublicBookmark()),
      nextCursor: bookmarks.nextCursor,
    };
  }

  static async create(
    ctx: AuthedContext,
    input: z.infer<typeof zNewBookmarkListSchema>,
  ): Promise<ManualList | SmartList> {
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
    return this.fromData(ctx, result);
  }

  static async getAll(ctx: AuthedContext): Promise<(ManualList | SmartList)[]> {
    const lists = await ctx.db.query.bookmarkLists.findMany({
      columns: {
        rssToken: false,
      },
      where: and(eq(bookmarkLists.userId, ctx.user.id)),
    });
    return lists.map((l) => this.fromData(ctx, l));
  }

  static async forBookmark(ctx: AuthedContext, bookmarkId: string) {
    const lists = await ctx.db.query.bookmarksInLists.findMany({
      where: and(eq(bookmarksInLists.bookmarkId, bookmarkId)),
      with: {
        list: {
          columns: {
            rssToken: false,
          },
        },
      },
    });
    invariant(lists.map((l) => l.list.userId).every((id) => id == ctx.user.id));
    return lists.map((l) => this.fromData(ctx, l.list));
  }

  ensureCanAccess(ctx: AuthedContext): void {
    if (this.list.userId != ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to access resource",
      });
    }
  }

  /**
   * Get the user's role for this list.
   * Returns "owner", "editor", "viewer", or null if the user has no access.
   */
  async getUserRole(userId: string): Promise<"owner" | "editor" | "viewer" | null> {
    // Check if user is the owner
    if (this.list.userId === userId) {
      return "owner";
    }

    // Check if user is a collaborator
    const collaborator = await this.ctx.db.query.listCollaborators.findFirst({
      where: and(
        eq(listCollaborators.listId, this.list.id),
        eq(listCollaborators.userId, userId),
      ),
    });

    if (collaborator) {
      return collaborator.role as "editor" | "viewer";
    }

    return null;
  }

  /**
   * Check if the user can view this list and its bookmarks.
   */
  async canUserView(userId: string): Promise<boolean> {
    const role = await this.getUserRole(userId);
    return role !== null;
  }

  /**
   * Check if the user can edit this list (add/remove bookmarks).
   */
  async canUserEdit(userId: string): Promise<boolean> {
    const role = await this.getUserRole(userId);
    return role === "owner" || role === "editor";
  }

  /**
   * Check if the user can manage this list (edit metadata, delete, manage collaborators).
   * Only the owner can manage the list.
   */
  async canUserManage(userId: string): Promise<boolean> {
    return this.list.userId === userId;
  }

  /**
   * Ensure the user can view this list. Throws if they cannot.
   */
  async ensureCanView(userId: string): Promise<void> {
    if (!(await this.canUserView(userId))) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to view this list",
      });
    }
  }

  /**
   * Ensure the user can edit this list. Throws if they cannot.
   */
  async ensureCanEdit(userId: string): Promise<void> {
    if (!(await this.canUserEdit(userId))) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to edit this list",
      });
    }
  }

  /**
   * Ensure the user can manage this list. Throws if they cannot.
   */
  async ensureCanManage(userId: string): Promise<void> {
    if (!(await this.canUserManage(userId))) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to manage this list",
      });
    }
  }

  async delete() {
    const res = await this.ctx.db
      .delete(bookmarkLists)
      .where(
        and(
          eq(bookmarkLists.id, this.list.id),
          eq(bookmarkLists.userId, this.ctx.user.id),
        ),
      );
    if (res.changes == 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
  }

  async getChildren(): Promise<(ManualList | SmartList)[]> {
    const lists = await List.getAll(this.ctx);
    const listById = new Map(lists.map((l) => [l.list.id, l]));

    const adjecencyList = new Map<string, string[]>();

    // Initialize all lists with empty arrays first
    lists.forEach((l) => {
      adjecencyList.set(l.list.id, []);
    });

    // Then populate the parent-child relationships
    lists.forEach((l) => {
      if (l.list.parentId) {
        const currentChildren = adjecencyList.get(l.list.parentId) ?? [];
        currentChildren.push(l.list.id);
        adjecencyList.set(l.list.parentId, currentChildren);
      }
    });

    const resultIds: string[] = [];
    const queue: string[] = [this.list.id];

    while (queue.length > 0) {
      const id = queue.pop()!;
      const children = adjecencyList.get(id) ?? [];
      children.forEach((childId) => {
        queue.push(childId);
        resultIds.push(childId);
      });
    }

    return resultIds.map((id) => listById.get(id)!);
  }

  async update(
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
          eq(bookmarkLists.id, this.list.id),
          eq(bookmarkLists.userId, this.ctx.user.id),
        ),
      )
      .returning();
    if (result.length == 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    this.list = result[0];
  }

  private async setRssToken(token: string | null) {
    const result = await this.ctx.db
      .update(bookmarkLists)
      .set({ rssToken: token })
      .where(
        and(
          eq(bookmarkLists.id, this.list.id),
          eq(bookmarkLists.userId, this.ctx.user.id),
        ),
      )
      .returning();
    if (result.length == 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return result[0].rssToken;
  }

  async getRssToken(): Promise<string | null> {
    const [result] = await this.ctx.db
      .select({ rssToken: bookmarkLists.rssToken })
      .from(bookmarkLists)
      .where(
        and(
          eq(bookmarkLists.id, this.list.id),
          eq(bookmarkLists.userId, this.ctx.user.id),
        ),
      )
      .limit(1);
    return result.rssToken ?? null;
  }

  async regenRssToken() {
    return await this.setRssToken(crypto.randomBytes(32).toString("hex"));
  }

  async clearRssToken() {
    await this.setRssToken(null);
  }

  /**
   * Add a collaborator to this list.
   */
  async addCollaborator(userId: string, role: "viewer" | "editor"): Promise<void> {
    await this.ensureCanManage(this.ctx.user.id);

    // Check that the user is not adding themselves
    if (userId === this.list.userId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot add the list owner as a collaborator",
      });
    }

    // Check that the collaborator is not already added
    const existing = await this.ctx.db.query.listCollaborators.findFirst({
      where: and(
        eq(listCollaborators.listId, this.list.id),
        eq(listCollaborators.userId, userId),
      ),
    });

    if (existing) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "User is already a collaborator on this list",
      });
    }

    // Only manual lists can be collaborative
    if (this.list.type !== "manual") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Only manual lists can have collaborators",
      });
    }

    await this.ctx.db.insert(listCollaborators).values({
      listId: this.list.id,
      userId,
      role,
      addedBy: this.ctx.user.id,
    });
  }

  /**
   * Remove a collaborator from this list.
   */
  async removeCollaborator(userId: string): Promise<void> {
    await this.ensureCanManage(this.ctx.user.id);

    const result = await this.ctx.db
      .delete(listCollaborators)
      .where(
        and(
          eq(listCollaborators.listId, this.list.id),
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

  /**
   * Update a collaborator's role.
   */
  async updateCollaboratorRole(userId: string, role: "viewer" | "editor"): Promise<void> {
    await this.ensureCanManage(this.ctx.user.id);

    const result = await this.ctx.db
      .update(listCollaborators)
      .set({ role })
      .where(
        and(
          eq(listCollaborators.listId, this.list.id),
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

  /**
   * Get all collaborators for this list.
   */
  async getCollaborators() {
    await this.ensureCanView(this.ctx.user.id);

    const collaborators = await this.ctx.db.query.listCollaborators.findMany({
      where: eq(listCollaborators.listId, this.list.id),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return collaborators.map((c) => ({
      id: c.id,
      userId: c.userId,
      role: c.role,
      addedAt: c.addedAt,
      user: c.user,
    }));
  }

  /**
   * Get all lists shared with the user (as a collaborator).
   */
  static async getSharedWithUser(ctx: AuthedContext): Promise<(ManualList | SmartList)[]> {
    const collaborations = await ctx.db.query.listCollaborators.findMany({
      where: eq(listCollaborators.userId, ctx.user.id),
      with: {
        list: true,
      },
    });

    return collaborations.map((c) => this.fromData(ctx, c.list));
  }

  abstract get type(): "manual" | "smart";
  abstract getBookmarkIds(ctx: AuthedContext): Promise<string[]>;
  abstract getSize(ctx: AuthedContext): Promise<number>;
  abstract addBookmark(bookmarkId: string): Promise<void>;
  abstract removeBookmark(bookmarkId: string): Promise<void>;
  abstract mergeInto(
    targetList: List,
    deleteSourceAfterMerge: boolean,
  ): Promise<void>;
}

export class SmartList extends List {
  parsedQuery: ReturnType<typeof parseSearchQuery> | null = null;

  constructor(ctx: AuthedContext, list: ZBookmarkList & { userId: string }) {
    super(ctx, list);
  }

  get type(): "smart" {
    invariant(this.list.type === "smart");
    return this.list.type;
  }

  get query() {
    invariant(this.list.query);
    return this.list.query;
  }

  getParsedQuery() {
    if (!this.parsedQuery) {
      const result = parseSearchQuery(this.query);
      if (result.result !== "full") {
        throw new Error("Invalid smart list query");
      }
      this.parsedQuery = result;
    }
    return this.parsedQuery;
  }

  async getBookmarkIds(): Promise<string[]> {
    const parsedQuery = this.getParsedQuery();
    if (!parsedQuery.matcher) {
      return [];
    }
    return await getBookmarkIdsFromMatcher(this.ctx, parsedQuery.matcher);
  }

  async getSize(): Promise<number> {
    return await this.getBookmarkIds().then((ids) => ids.length);
  }

  addBookmark(_bookmarkId: string): Promise<void> {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Smart lists cannot be added to",
    });
  }

  removeBookmark(_bookmarkId: string): Promise<void> {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Smart lists cannot be removed from",
    });
  }

  mergeInto(
    _targetList: List,
    _deleteSourceAfterMerge: boolean,
  ): Promise<void> {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Smart lists cannot be merged",
    });
  }
}

export class ManualList extends List {
  constructor(ctx: AuthedContext, list: ZBookmarkList & { userId: string }) {
    super(ctx, list);
  }

  get type(): "manual" {
    invariant(this.list.type === "manual");
    return this.list.type;
  }

  async getBookmarkIds(): Promise<string[]> {
    const results = await this.ctx.db
      .select({ id: bookmarksInLists.bookmarkId })
      .from(bookmarksInLists)
      .where(eq(bookmarksInLists.listId, this.list.id));
    return results.map((r) => r.id);
  }

  async getSize(): Promise<number> {
    const results = await this.ctx.db
      .select({ count: count() })
      .from(bookmarksInLists)
      .where(eq(bookmarksInLists.listId, this.list.id));
    return results[0].count;
  }

  async addBookmark(bookmarkId: string): Promise<void> {
    // Check that the user can edit this list
    await this.ensureCanEdit(this.ctx.user.id);

    try {
      await this.ctx.db.insert(bookmarksInLists).values({
        listId: this.list.id,
        bookmarkId,
        addedBy: this.ctx.user.id,
      });
      await triggerRuleEngineOnEvent(bookmarkId, [
        {
          type: "addedToList",
          listId: this.list.id,
        },
      ]);
    } catch (e) {
      if (e instanceof SqliteError) {
        if (e.code == "SQLITE_CONSTRAINT_PRIMARYKEY") {
          // this is fine, it just means the bookmark is already in the list
          return;
        }
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong",
      });
    }
  }

  async removeBookmark(bookmarkId: string): Promise<void> {
    // Check that the user can edit this list
    await this.ensureCanEdit(this.ctx.user.id);

    const deleted = await this.ctx.db
      .delete(bookmarksInLists)
      .where(
        and(
          eq(bookmarksInLists.listId, this.list.id),
          eq(bookmarksInLists.bookmarkId, bookmarkId),
        ),
      );
    if (deleted.changes == 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Bookmark ${bookmarkId} is already not in list ${this.list.id}`,
      });
    }
    await triggerRuleEngineOnEvent(bookmarkId, [
      {
        type: "removedFromList",
        listId: this.list.id,
      },
    ]);
  }

  async update(input: z.infer<typeof zEditBookmarkListSchemaWithValidation>) {
    if (input.query) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Manual lists cannot have a query",
      });
    }
    return super.update(input);
  }

  async mergeInto(
    targetList: List,
    deleteSourceAfterMerge: boolean,
  ): Promise<void> {
    if (targetList.type !== "manual") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You can only merge into a manual list",
      });
    }

    const bookmarkIds = await this.getBookmarkIds();

    await this.ctx.db.transaction(async (tx) => {
      await tx
        .insert(bookmarksInLists)
        .values(
          bookmarkIds.map((id) => ({
            bookmarkId: id,
            listId: targetList.list.id,
          })),
        )
        .onConflictDoNothing();

      if (deleteSourceAfterMerge) {
        await tx
          .delete(bookmarkLists)
          .where(eq(bookmarkLists.id, this.list.id));
      }
    });
  }
}
