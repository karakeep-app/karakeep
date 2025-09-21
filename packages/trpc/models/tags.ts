import { TRPCError } from "@trpc/server";
import { and, count, eq, inArray, notExists } from "drizzle-orm";
import { z } from "zod";

import type { ZAttachedByEnum } from "@karakeep/shared/types/tags";
import { SqliteError } from "@karakeep/db";
import { bookmarkTags, tagsOnBookmarks } from "@karakeep/db/schema";
import { triggerSearchReindex } from "@karakeep/shared-server";
import {
  zCreateTagRequestSchema,
  zGetTagResponseSchema,
  zTagBasicSchema,
  zUpdateTagRequestSchema,
} from "@karakeep/shared/types/tags";

import { AuthedContext } from "..";
import { PrivacyAware } from "./privacy";

export class Tag implements PrivacyAware {
  constructor(
    protected ctx: AuthedContext,
    public tag: typeof bookmarkTags.$inferSelect,
  ) {}

  static async fromId(ctx: AuthedContext, id: string): Promise<Tag> {
    const tag = await ctx.db.query.bookmarkTags.findFirst({
      where: eq(bookmarkTags.id, id),
    });

    if (!tag) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Tag not found",
      });
    }

    // If it exists but belongs to another user, throw forbidden error
    if (tag.userId !== ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to access resource",
      });
    }

    return new Tag(ctx, tag);
  }

  static async create(
    ctx: AuthedContext,
    input: z.infer<typeof zCreateTagRequestSchema>,
  ): Promise<Tag> {
    try {
      const [result] = await ctx.db
        .insert(bookmarkTags)
        .values({
          name: input.name,
          userId: ctx.user.id,
        })
        .returning();

      return new Tag(ctx, result);
    } catch (e) {
      if (e instanceof SqliteError && e.code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tag name already exists for this user.",
        });
      }
      throw e;
    }
  }

  static async getAllWithStats(ctx: AuthedContext) {
    const tags = await ctx.db
      .select({
        id: bookmarkTags.id,
        name: bookmarkTags.name,
        attachedBy: tagsOnBookmarks.attachedBy,
        count: count(),
      })
      .from(bookmarkTags)
      .leftJoin(tagsOnBookmarks, eq(bookmarkTags.id, tagsOnBookmarks.tagId))
      .where(and(eq(bookmarkTags.userId, ctx.user.id)))
      .groupBy(bookmarkTags.id, tagsOnBookmarks.attachedBy);

    if (tags.length === 0) {
      return [];
    }

    const tagsById = tags.reduce<
      Record<
        string,
        {
          id: string;
          name: string;
          attachedBy: "ai" | "human" | null;
          count: number;
        }[]
      >
    >((acc, curr) => {
      if (!acc[curr.id]) {
        acc[curr.id] = [];
      }
      acc[curr.id].push(curr);
      return acc;
    }, {});

    return Object.entries(tagsById).map(([k, t]) => ({
      id: k,
      name: t[0].name,
      ...Tag._aggregateStats(t),
    }));
  }

  static async deleteUnused(ctx: AuthedContext): Promise<number> {
    const res = await ctx.db
      .delete(bookmarkTags)
      .where(
        and(
          eq(bookmarkTags.userId, ctx.user.id),
          notExists(
            ctx.db
              .select({ id: tagsOnBookmarks.tagId })
              .from(tagsOnBookmarks)
              .where(eq(tagsOnBookmarks.tagId, bookmarkTags.id)),
          ),
        ),
      );
    return res.changes;
  }

  static async merge(
    ctx: AuthedContext,
    input: {
      intoTagId: string;
      fromTagIds: string[];
    },
  ): Promise<{
    mergedIntoTagId: string;
    deletedTags: string[];
  }> {
    const requestedTags = new Set([input.intoTagId, ...input.fromTagIds]);
    if (requestedTags.size === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No tags provided",
      });
    }
    if (input.fromTagIds.includes(input.intoTagId)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot merge tag into itself",
      });
    }

    const affectedTags = await ctx.db.query.bookmarkTags.findMany({
      where: and(
        eq(bookmarkTags.userId, ctx.user.id),
        inArray(bookmarkTags.id, [...requestedTags]),
      ),
      columns: {
        id: true,
        userId: true,
      },
    });

    if (affectedTags.some((t) => t.userId !== ctx.user.id)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to access resource",
      });
    }
    if (affectedTags.length !== requestedTags.size) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "One or more tags not found",
      });
    }

    const { deletedTags, affectedBookmarks } = await ctx.db.transaction(
      async (trx) => {
        const unlinked = await trx
          .delete(tagsOnBookmarks)
          .where(and(inArray(tagsOnBookmarks.tagId, input.fromTagIds)))
          .returning();

        if (unlinked.length > 0) {
          await trx
            .insert(tagsOnBookmarks)
            .values(
              unlinked.map((u) => ({
                ...u,
                tagId: input.intoTagId,
              })),
            )
            .onConflictDoNothing();
        }

        const deletedTags = await trx
          .delete(bookmarkTags)
          .where(
            and(
              inArray(bookmarkTags.id, input.fromTagIds),
              eq(bookmarkTags.userId, ctx.user.id),
            ),
          )
          .returning({ id: bookmarkTags.id });

        return {
          deletedTags,
          affectedBookmarks: unlinked.map((u) => u.bookmarkId),
        };
      },
    );

    try {
      await Promise.all(
        affectedBookmarks.map((id) => triggerSearchReindex(id)),
      );
    } catch (e) {
      console.error("Failed to reindex affected bookmarks", e);
    }

    return {
      deletedTags: deletedTags.map((t) => t.id),
      mergedIntoTagId: input.intoTagId,
    };
  }

  ensureCanAccess(ctx: AuthedContext): void {
    if (this.tag.userId !== ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to access resource",
      });
    }
  }

  async delete(): Promise<void> {
    const affectedBookmarks = await this.ctx.db
      .select({
        bookmarkId: tagsOnBookmarks.bookmarkId,
      })
      .from(tagsOnBookmarks)
      .where(eq(tagsOnBookmarks.tagId, this.tag.id));

    const res = await this.ctx.db
      .delete(bookmarkTags)
      .where(
        and(
          eq(bookmarkTags.id, this.tag.id),
          eq(bookmarkTags.userId, this.ctx.user.id),
        ),
      );

    if (res.changes === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    await Promise.all(
      affectedBookmarks.map(({ bookmarkId }) =>
        triggerSearchReindex(bookmarkId),
      ),
    );
  }

  async update(input: z.infer<typeof zUpdateTagRequestSchema>): Promise<void> {
    try {
      const result = await this.ctx.db
        .update(bookmarkTags)
        .set({
          name: input.name,
        })
        .where(
          and(
            eq(bookmarkTags.id, this.tag.id),
            eq(bookmarkTags.userId, this.ctx.user.id),
          ),
        )
        .returning();

      if (result.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      this.tag = result[0];

      try {
        const affectedBookmarks =
          await this.ctx.db.query.tagsOnBookmarks.findMany({
            where: eq(tagsOnBookmarks.tagId, this.tag.id),
            columns: {
              bookmarkId: true,
            },
          });
        await Promise.all(
          affectedBookmarks
            .map((b) => b.bookmarkId)
            .map((id) => triggerSearchReindex(id)),
        );
      } catch (e) {
        console.error("Failed to reindex affected bookmarks", e);
      }
    } catch (e) {
      if (e instanceof SqliteError) {
        if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Tag name already exists. You might want to consider a merge instead.",
          });
        }
      }
      throw e;
    }
  }

  static _aggregateStats(
    res: { attachedBy: "ai" | "human" | null; count: number }[],
  ) {
    const numBookmarksByAttachedType = res.reduce<
      Record<ZAttachedByEnum, number>
    >(
      (acc, curr) => {
        if (curr.attachedBy) {
          acc[curr.attachedBy] += curr.count;
        }
        return acc;
      },
      { ai: 0, human: 0 },
    );
    return {
      numBookmarks:
        numBookmarksByAttachedType.ai + numBookmarksByAttachedType.human,
      numBookmarksByAttachedType,
    };
  }

  async getStats(): Promise<z.infer<typeof zGetTagResponseSchema>> {
    const res = await this.ctx.db
      .select({
        id: bookmarkTags.id,
        name: bookmarkTags.name,
        attachedBy: tagsOnBookmarks.attachedBy,
        count: count(),
      })
      .from(bookmarkTags)
      .leftJoin(tagsOnBookmarks, eq(bookmarkTags.id, tagsOnBookmarks.tagId))
      .where(
        and(
          eq(bookmarkTags.id, this.tag.id),
          eq(bookmarkTags.userId, this.ctx.user.id),
        ),
      )
      .groupBy(tagsOnBookmarks.attachedBy);

    if (res.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    return {
      id: res[0].id,
      name: res[0].name,
      ...Tag._aggregateStats(res),
    };
  }

  asBasicTag(): z.infer<typeof zTagBasicSchema> {
    return {
      id: this.tag.id,
      name: this.tag.name,
    };
  }
}
