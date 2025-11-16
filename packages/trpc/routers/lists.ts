import { experimental_trpcMiddleware, TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  zBookmarkListSchema,
  zEditBookmarkListSchemaWithValidation,
  zMergeListSchema,
  zNewBookmarkListSchema,
} from "@karakeep/shared/types/lists";

import type { AuthedContext } from "../index";
import { authedProcedure, router } from "../index";
import { List } from "../models/lists";
import { ensureBookmarkOwnership } from "./bookmarks";

export const ensureListOwnership = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { listId: string };
}>().create(async (opts) => {
  const list = await List.fromId(opts.ctx, opts.input.listId);
  return opts.next({
    ctx: {
      ...opts.ctx,
      list,
    },
  });
});

export const ensureListEditorOrOwner = experimental_trpcMiddleware<{
  ctx: AuthedContext & { list: List };
  input: { listId: string };
}>().create(async (opts) => {
  const canEdit = await opts.ctx.list.canUserEdit(opts.ctx.user.id);
  if (!canEdit) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "User does not have edit permissions for this list",
    });
  }
  return opts.next({
    ctx: opts.ctx,
  });
});

export const listsAppRouter = router({
  create: authedProcedure
    .input(zNewBookmarkListSchema)
    .output(zBookmarkListSchema)
    .mutation(async ({ input, ctx }) => {
      return await List.create(ctx, input).then((l) => l.list);
    }),
  edit: authedProcedure
    .input(zEditBookmarkListSchemaWithValidation)
    .output(zBookmarkListSchema)
    .use(ensureListOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.list.update(input);
      return ctx.list.list;
    }),
  merge: authedProcedure
    .input(zMergeListSchema)
    .mutation(async ({ input, ctx }) => {
      const [sourceList, targetList] = await Promise.all([
        List.fromId(ctx, input.sourceId),
        List.fromId(ctx, input.targetId),
      ]);
      return await sourceList.mergeInto(
        targetList,
        input.deleteSourceAfterMerge,
      );
    }),
  delete: authedProcedure
    .input(
      z.object({
        listId: z.string(),
        deleteChildren: z.boolean().optional().default(false),
      }),
    )
    .use(ensureListOwnership)
    .mutation(async ({ ctx, input }) => {
      if (input.deleteChildren) {
        const children = await ctx.list.getChildren();
        await Promise.all(children.map((l) => l.delete()));
      }
      await ctx.list.delete();
    }),
  addToList: authedProcedure
    .input(
      z.object({
        listId: z.string(),
        bookmarkId: z.string(),
      }),
    )
    .use(ensureListOwnership)
    .use(ensureListEditorOrOwner)
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.list.addBookmark(input.bookmarkId);
    }),
  removeFromList: authedProcedure
    .input(
      z.object({
        listId: z.string(),
        bookmarkId: z.string(),
      }),
    )
    .use(ensureListOwnership)
    .use(ensureListEditorOrOwner)
    .mutation(async ({ input, ctx }) => {
      await ctx.list.removeBookmark(input.bookmarkId);
    }),
  get: authedProcedure
    .input(
      z.object({
        listId: z.string(),
      }),
    )
    .output(zBookmarkListSchema)
    .use(ensureListOwnership)
    .query(async ({ ctx }) => {
      const userRole = await ctx.list.getUserRole(ctx.user.id);
      return {
        ...ctx.list.list,
        userRole: userRole || undefined,
      };
    }),
  list: authedProcedure
    .output(
      z.object({
        lists: z.array(zBookmarkListSchema),
      }),
    )
    .query(async ({ ctx }) => {
      const results = await List.getAll(ctx);
      return { lists: results.map((l) => l.list) };
    }),
  getListsOfBookmark: authedProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .output(
      z.object({
        lists: z.array(zBookmarkListSchema),
      }),
    )
    .use(ensureBookmarkOwnership)
    .query(async ({ input, ctx }) => {
      const lists = await List.forBookmark(ctx, input.bookmarkId);
      return { lists: lists.map((l) => l.list) };
    }),
  stats: authedProcedure
    .output(
      z.object({
        stats: z.map(z.string(), z.number()),
      }),
    )
    .query(async ({ ctx }) => {
      const lists = await List.getAll(ctx);
      const sizes = await Promise.all(lists.map((l) => l.getSize()));
      return { stats: new Map(lists.map((l, i) => [l.list.id, sizes[i]])) };
    }),

  // Rss endpoints
  regenRssToken: authedProcedure
    .input(
      z.object({
        listId: z.string(),
      }),
    )
    .output(
      z.object({
        token: z.string(),
      }),
    )
    .use(ensureListOwnership)
    .mutation(async ({ ctx }) => {
      const token = await ctx.list.regenRssToken();
      return { token: token! };
    }),
  clearRssToken: authedProcedure
    .input(
      z.object({
        listId: z.string(),
      }),
    )
    .use(ensureListOwnership)
    .mutation(async ({ ctx }) => {
      await ctx.list.clearRssToken();
    }),
  getRssToken: authedProcedure
    .input(
      z.object({
        listId: z.string(),
      }),
    )
    .output(
      z.object({
        token: z.string().nullable(),
      }),
    )
    .use(ensureListOwnership)
    .query(async ({ ctx }) => {
      return { token: await ctx.list.getRssToken() };
    }),

  // Collaboration endpoints
  addCollaborator: authedProcedure
    .input(
      z.object({
        listId: z.string(),
        email: z.string().email(),
        role: z.enum(["viewer", "editor"]),
      }),
    )
    .use(ensureListOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.list.addCollaboratorByEmail(input.email, input.role);
    }),
  removeCollaborator: authedProcedure
    .input(
      z.object({
        listId: z.string(),
        userId: z.string(),
      }),
    )
    .use(ensureListOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.list.removeCollaborator(input.userId);
    }),
  updateCollaboratorRole: authedProcedure
    .input(
      z.object({
        listId: z.string(),
        userId: z.string(),
        role: z.enum(["viewer", "editor"]),
      }),
    )
    .use(ensureListOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.list.updateCollaboratorRole(input.userId, input.role);
    }),
  getCollaborators: authedProcedure
    .input(
      z.object({
        listId: z.string(),
      }),
    )
    .output(
      z.object({
        collaborators: z.array(
          z.object({
            id: z.string(),
            userId: z.string(),
            role: z.enum(["viewer", "editor"]),
            addedAt: z.date(),
            user: z.object({
              id: z.string(),
              name: z.string(),
              email: z.string(),
            }),
          }),
        ),
      }),
    )
    .use(ensureListOwnership)
    .query(async ({ ctx }) => {
      const collaborators = await ctx.list.getCollaborators();
      return { collaborators };
    }),
  getSharedWithMe: authedProcedure
    .output(
      z.object({
        lists: z.array(zBookmarkListSchema),
      }),
    )
    .query(async ({ ctx }) => {
      const lists = await List.getSharedWithUser(ctx);
      return { lists: lists.map((l) => l.list) };
    }),
  leaveList: authedProcedure
    .input(
      z.object({
        listId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const list = await List.fromId(ctx, input.listId);
      await list.leaveList(ctx.user.id);
    }),
});
