import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, count, eq, inArray, or } from "drizzle-orm";
import invariant from "tiny-invariant";
import { z } from "zod";

import { SqliteError } from "@karakeep/db";
import {
  bookmarkLists,
  bookmarksInLists,
  listCollaborators,
  users,
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
import { switchCase } from "@karakeep/shared/utils/switch";

import { AuthedContext, Context } from "..";
import { buildImpersonatingAuthedContext } from "../lib/impersonate";
import { getBookmarkIdsFromMatcher } from "../lib/search";
import { Bookmark } from "./bookmarks";
import { ListInvitation } from "./listInvitations";

interface ListCollaboratorEntry {
  membershipId: string;
}

export abstract class List {
  protected constructor(
    protected ctx: AuthedContext,
    protected list: ZBookmarkList & { userId: string },
  ) {}

  get id() {
    return this.list.id;
  }

  asZBookmarkList() {
    if (this.list.userId === this.ctx.user.id) {
      return this.list;
    }

    // There's some privacy implications here, so we need to think twice
    // about the values that we return.
    return {
      id: this.list.id,
      name: this.list.name,
      description: this.list.description,
      userId: this.list.userId,
      icon: this.list.icon,
      type: this.list.type,
      query: this.list.query,
      userRole: this.list.userRole,
      hasCollaborators: this.list.hasCollaborators,

      // Hide parentId as it is not relevant to the user
      parentId: null,
      // Hide whether the list is public or not.
      public: false,
    };
  }

  private static fromData(
    ctx: AuthedContext,
    data: ZBookmarkList & { userId: string },
    collaboratorEntry: ListCollaboratorEntry | null,
  ) {
    if (data.type === "smart") {
      return new SmartList(ctx, data);
    } else {
      return new ManualList(ctx, data, collaboratorEntry);
    }
  }

  static async fromId(
    ctx: AuthedContext,
    id: string,
  ): Promise<ManualList | SmartList> {
    // First try to find the list owned by the user
    let list = await (async (): Promise<
      (ZBookmarkList & { userId: string }) | undefined
    > => {
      const l = await ctx.db.query.bookmarkLists.findFirst({
        columns: {
          rssToken: false,
        },
        where: and(
          eq(bookmarkLists.id, id),
          eq(bookmarkLists.userId, ctx.user.id),
        ),
        with: {
          collaborators: {
            columns: {
              id: true,
            },
            limit: 1,
          },
        },
      });
      return l
        ? {
            ...l,
            userRole: "owner",
            hasCollaborators: l.collaborators.length > 0,
          }
        : l;
    })();

    // If not found, check if the user is a collaborator
    let collaboratorEntry: ListCollaboratorEntry | null = null;
    if (!list) {
      const collaborator = await ctx.db.query.listCollaborators.findFirst({
        where: and(
          eq(listCollaborators.listId, id),
          eq(listCollaborators.userId, ctx.user.id),
        ),
        with: {
          list: {
            columns: {
              rssToken: false,
            },
          },
        },
      });

      if (collaborator) {
        list = {
          ...collaborator.list,
          userRole: collaborator.role,
          hasCollaborators: true, // If you're a collaborator, the list has collaborators
        };
        collaboratorEntry = {
          membershipId: collaborator.id,
        };
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
      return new ManualList(ctx, list, collaboratorEntry);
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
    const listObj = List.fromData(
      authedCtx,
      {
        ...listdb,
        userRole: "public",
        hasCollaborators: false, // Public lists don't expose collaborators
      },
      null,
    );
    const bookmarkIds = await listObj.getBookmarkIds();
    const list = listObj.asZBookmarkList();

    const bookmarks = await Bookmark.loadMulti(authedCtx, {
      ids: bookmarkIds,
      includeContent: false,
      limit: pagination.limit,
      sortOrder: pagination.order,
      cursor: pagination.cursor,
    });

    return {
      list: {
        icon: list.icon,
        name: list.name,
        description: list.description,
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
    return this.fromData(
      ctx,
      {
        ...result,
        userRole: "owner",
        hasCollaborators: false, // Newly created lists have no collaborators
      },
      null,
    );
  }

  static async getAll(ctx: AuthedContext) {
    const [ownedLists, sharedLists] = await Promise.all([
      this.getAllOwned(ctx),
      this.getSharedWithUser(ctx),
    ]);
    return [...ownedLists, ...sharedLists];
  }

  static async getAllOwned(
    ctx: AuthedContext,
  ): Promise<(ManualList | SmartList)[]> {
    const lists = await ctx.db.query.bookmarkLists.findMany({
      columns: {
        rssToken: false,
      },
      where: and(eq(bookmarkLists.userId, ctx.user.id)),
      with: {
        collaborators: {
          columns: {
            id: true,
          },
          limit: 1,
        },
      },
    });
    return lists.map((l) =>
      this.fromData(
        ctx,
        {
          ...l,
          userRole: "owner",
          hasCollaborators: l.collaborators.length > 0,
        },
        null /* this is an owned list */,
      ),
    );
  }

  static async forBookmark(ctx: AuthedContext, bookmarkId: string) {
    const lists = await ctx.db.query.bookmarksInLists.findMany({
      where: eq(bookmarksInLists.bookmarkId, bookmarkId),
      with: {
        list: {
          columns: {
            rssToken: false,
          },
          with: {
            collaborators: {
              where: eq(listCollaborators.userId, ctx.user.id),
              columns: {
                id: true,
                role: true,
              },
            },
          },
        },
      },
    });

    // For owner lists, we need to check if they actually have collaborators
    // by querying the collaborators table separately (without user filter)
    const ownerListIds = lists
      .filter((l) => l.list.userId === ctx.user.id)
      .map((l) => l.list.id);

    const listsWithCollaborators = new Set<string>();
    if (ownerListIds.length > 0) {
      // Use a single query with inArray instead of N queries
      const collaborators = await ctx.db.query.listCollaborators.findMany({
        where: inArray(listCollaborators.listId, ownerListIds),
        columns: {
          listId: true,
        },
      });
      collaborators.forEach((c) => {
        listsWithCollaborators.add(c.listId);
      });
    }

    return lists.flatMap((l) => {
      let userRole: "owner" | "editor" | "viewer" | null;
      let collaboratorEntry: ListCollaboratorEntry | null = null;
      if (l.list.collaborators.length > 0) {
        invariant(l.list.collaborators.length == 1);
        userRole = l.list.collaborators[0].role;
        collaboratorEntry = {
          membershipId: l.list.collaborators[0].id,
        };
      } else if (l.list.userId === ctx.user.id) {
        userRole = "owner";
      } else {
        userRole = null;
      }
      return userRole
        ? [
            this.fromData(
              ctx,
              {
                ...l.list,
                userRole,
                hasCollaborators:
                  userRole !== "owner"
                    ? true
                    : listsWithCollaborators.has(l.list.id),
              },
              collaboratorEntry,
            ),
          ]
        : [];
    });
  }

  /**
   * Check if the user can view this list and its bookmarks.
   */
  canUserView(): boolean {
    return switchCase(this.list.userRole, {
      owner: true,
      editor: true,
      viewer: true,
      public: true,
    });
  }

  /**
   * Check if the user can edit this list (add/remove bookmarks).
   */
  canUserEdit(): boolean {
    return switchCase(this.list.userRole, {
      owner: true,
      editor: true,
      viewer: false,
      public: false,
    });
  }

  /**
   * Check if the user can manage this list (edit metadata, delete, manage collaborators).
   * Only the owner can manage the list.
   */
  canUserManage(): boolean {
    return switchCase(this.list.userRole, {
      owner: true,
      editor: false,
      viewer: false,
      public: false,
    });
  }

  /**
   * Ensure the user can view this list. Throws if they cannot.
   */
  ensureCanView(): void {
    if (!this.canUserView()) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to view this list",
      });
    }
  }

  /**
   * Ensure the user can edit this list. Throws if they cannot.
   */
  ensureCanEdit(): void {
    if (!this.canUserEdit()) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to edit this list",
      });
    }
  }

  /**
   * Ensure the user can manage this list. Throws if they cannot.
   */
  ensureCanManage(): void {
    if (!this.canUserManage()) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to manage this list",
      });
    }
  }

  async delete() {
    this.ensureCanManage();
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
    const lists = await List.getAllOwned(this.ctx);
    const listById = new Map(lists.map((l) => [l.id, l]));

    const adjecencyList = new Map<string, string[]>();

    // Initialize all lists with empty arrays first
    lists.forEach((l) => {
      adjecencyList.set(l.id, []);
    });

    // Then populate the parent-child relationships
    lists.forEach((l) => {
      const parentId = l.asZBookmarkList().parentId;
      if (parentId) {
        const currentChildren = adjecencyList.get(parentId) ?? [];
        currentChildren.push(l.id);
        adjecencyList.set(parentId, currentChildren);
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
    this.ensureCanManage();
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
    invariant(result[0].userId === this.ctx.user.id);
    // Fetch current collaborators to update hasCollaborators
    const collaboratorsCount =
      await this.ctx.db.query.listCollaborators.findMany({
        where: eq(listCollaborators.listId, this.list.id),
        columns: {
          id: true,
        },
        limit: 1,
      });
    this.list = {
      ...result[0],
      userRole: "owner",
      hasCollaborators: collaboratorsCount.length > 0,
    };
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
    this.ensureCanManage();
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
    this.ensureCanManage();
    return await this.setRssToken(crypto.randomBytes(32).toString("hex"));
  }

  async clearRssToken() {
    this.ensureCanManage();
    await this.setRssToken(null);
  }

  /**
   * Add a collaborator to this list by email.
   * Creates a pending invitation that must be accepted by the user.
   * Returns the invitation ID.
   */
  async addCollaboratorByEmail(
    email: string,
    role: "viewer" | "editor",
  ): Promise<string> {
    this.ensureCanManage();

    return await ListInvitation.inviteByEmail(this.ctx, {
      email,
      role,
      listId: this.list.id,
      listName: this.list.name,
      listType: this.list.type,
      listOwnerId: this.list.userId,
      inviterUserId: this.ctx.user.id,
      inviterName: this.ctx.user.name ?? null,
    });
  }

  /**
   * Remove a collaborator from this list.
   * Only the list owner can remove collaborators.
   * This also removes all bookmarks that the collaborator added to the list.
   */
  async removeCollaborator(userId: string): Promise<void> {
    this.ensureCanManage();

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
   * Allow a user to leave a list (remove themselves as a collaborator).
   * This bypasses the owner check since users should be able to leave lists they're collaborating on.
   * This also removes all bookmarks that the user added to the list.
   */
  async leaveList(): Promise<void> {
    if (this.list.userRole === "owner") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "List owners cannot leave their own list. Delete the list instead.",
      });
    }

    const result = await this.ctx.db
      .delete(listCollaborators)
      .where(
        and(
          eq(listCollaborators.listId, this.list.id),
          eq(listCollaborators.userId, this.ctx.user.id),
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
  async updateCollaboratorRole(
    userId: string,
    role: "viewer" | "editor",
  ): Promise<void> {
    this.ensureCanManage();

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
   * Get all collaborators for this list, including pending invitations.
   * For privacy, pending invitations show masked user info unless the invitation has been accepted.
   */
  async getCollaborators() {
    this.ensureCanView();

    const isOwner = this.list.userId === this.ctx.user.id;

    const [collaborators, invitations] = await Promise.all([
      this.ctx.db.query.listCollaborators.findMany({
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
      }),
      // Only show invitations for the owner
      isOwner
        ? ListInvitation.invitationsForList(this.ctx, {
            listId: this.list.id,
          })
        : [],
    ]);

    // Get the owner information
    const owner = await this.ctx.db.query.users.findFirst({
      where: eq(users.id, this.list.userId),
      columns: {
        id: true,
        name: true,
        email: true,
      },
    });

    const collaboratorEntries = collaborators.map((c) => {
      return {
        id: c.id,
        userId: c.userId,
        role: c.role,
        status: "accepted" as const,
        addedAt: c.addedAt,
        invitedAt: c.addedAt,
        user: {
          id: c.user.id,
          name: c.user.name,
          // Only show email to the owner for privacy
          email: isOwner ? c.user.email : null,
        },
      };
    });

    return {
      collaborators: [...collaboratorEntries, ...invitations],
      owner: owner
        ? {
            id: owner.id,
            name: owner.name,
            // Only show owner email to the owner for privacy
            email: isOwner ? owner.email : null,
          }
        : null,
    };
  }

  /**
   * Get all lists shared with the user (as a collaborator).
   * Only includes lists where the invitation has been accepted.
   */
  static async getSharedWithUser(
    ctx: AuthedContext,
  ): Promise<(ManualList | SmartList)[]> {
    const collaborations = await ctx.db.query.listCollaborators.findMany({
      where: eq(listCollaborators.userId, ctx.user.id),
      with: {
        list: {
          columns: {
            rssToken: false,
          },
        },
      },
    });

    return collaborations.map((c) =>
      this.fromData(
        ctx,
        {
          ...c.list,
          userRole: c.role,
          hasCollaborators: true, // If you're a collaborator, the list has collaborators
        },
        {
          membershipId: c.id,
        },
      ),
    );
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
  constructor(
    ctx: AuthedContext,
    list: ZBookmarkList & { userId: string },
    private collaboratorEntry: ListCollaboratorEntry | null,
  ) {
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
    this.ensureCanEdit();

    try {
      await this.ctx.db.insert(bookmarksInLists).values({
        listId: this.list.id,
        bookmarkId,
        listMembershipId: this.collaboratorEntry?.membershipId,
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
    this.ensureCanEdit();

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
    this.ensureCanManage();
    targetList.ensureCanManage();
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
            listId: targetList.id,
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
