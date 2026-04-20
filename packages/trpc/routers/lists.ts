import { experimental_trpcMiddleware } from "@trpc/server";
import { z } from "zod";

import {
  zBookmarkListSchema,
  zEditBookmarkListSchemaWithValidation,
  zMergeListSchema,
  zNewBookmarkListSchema,
} from "@karakeep/shared/types/lists";

import type { AuthedContext } from "../index";
import { authedProcedure, createRateLimitMiddleware, router } from "../index";
import { ListInvitation } from "../models/listInvitations";
import { List } from "../models/lists";
import { ensureBookmarkOwnership } from "./bookmarks";

export const ensureListAtLeastViewer = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { listId: string };
}>().create(async (opts) => {
  // This would throw if the user can't view the list
  const list = await List.fromId(opts.ctx, opts.input.listId);
  return opts.next({
    ctx: {
      ...opts.ctx,
      list,
    },
  });
});

export const ensureListAtLeastEditor = experimental_trpcMiddleware<{
  ctx: AuthedContext & { list: List };
  input: { listId: string };
}>().create(async (opts) => {
  opts.ctx.list.ensureCanEdit();
  return opts.next({
    ctx: opts.ctx,
  });
});

export const ensureListAtLeastOwner = experimental_trpcMiddleware<{
  ctx: AuthedContext & { list: List };
  input: { listId: string };
}>().create(async (opts) => {
  opts.ctx.list.ensureCanManage();
  return opts.next({
    ctx: opts.ctx,
  });
});

export const ensureInvitationAccess = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { invitationId: string };
}>().create(async (opts) => {
  const invitation = await ListInvitation.fromId(
    opts.ctx,
    opts.input.invitationId,
  );
  return opts.next({
    ctx: {
      ...opts.ctx,
      invitation,
    },
  });
});

export const listsAppRouter = router({
  create: authedProcedure
    .input(zNewBookmarkListSchema)
    .output(zBookmarkListSchema)
    .mutation(async ({ input, ctx }) => {
      return await List.create(ctx, input).then((l) => l.asZBookmarkList());
    }),
  edit: authedProcedure
    .input(zEditBookmarkListSchemaWithValidation)
    .output(zBookmarkListSchema)
    .use(ensureListAtLeastViewer)
    .use(ensureListAtLeastOwner)
    .mutation(async ({ input, ctx }) => {
      await ctx.list.update(input);
      return ctx.list.asZBookmarkList();
    }),
  merge: authedProcedure
    .input(zMergeListSchema)
    .mutation(async ({ input, ctx }) => {
      const [sourceList, targetList] = await Promise.all([
        List.fromId(ctx, input.sourceId),
        List.fromId(ctx, input.targetId),
      ]);
      sourceList.ensureCanManage();
      targetList.ensureCanManage();
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
    .use(ensureListAtLeastViewer)
    .use(ensureListAtLeastOwner)
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
    .use(ensureListAtLeastViewer)
    .use(ensureListAtLeastEditor)
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
    .use(ensureListAtLeastViewer)
    .use(ensureListAtLeastEditor)
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
    .use(ensureListAtLeastViewer)
    .query(async ({ ctx }) => {
      return ctx.list.asZBookmarkList();
    }),
  list: authedProcedure
    .output(
      z.object({
        lists: z.array(zBookmarkListSchema),
      }),
    )
    .query(async ({ ctx }) => {
      const results = await List.getAll(ctx);
      return { lists: results.map((l) => l.asZBookmarkList()) };
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
      return { lists: lists.map((l) => l.asZBookmarkList()) };
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
      return { stats: new Map(lists.map((l, i) => [l.id, sizes[i]])) };
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
    .use(ensureListAtLeastViewer)
    .use(ensureListAtLeastOwner)
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
    .use(ensureListAtLeastViewer)
    .use(ensureListAtLeastOwner)
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
    .use(ensureListAtLeastViewer)
    .use(ensureListAtLeastOwner)
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
    .output(
      z.object({
        invitationId: z.string(),
      }),
    )
    .use(
      createRateLimitMiddleware({
        name: "lists.addCollaborator",
        windowMs: 15 * 60 * 1000,
        maxRequests: 20,
      }),
    )
    .use(ensureListAtLeastViewer)
    .use(ensureListAtLeastOwner)
    .mutation(async ({ input, ctx }) => {
      return {
        invitationId: await ctx.list.addCollaboratorByEmail(
          input.email,
          input.role,
        ),
      };
    }),
  removeCollaborator: authedProcedure
    .input(
      z.object({
        listId: z.string(),
        userId: z.string(),
      }),
    )
    .use(ensureListAtLeastViewer)
    .use(ensureListAtLeastOwner)
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
    .use(ensureListAtLeastViewer)
    .use(ensureListAtLeastOwner)
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
            status: z.enum(["pending", "accepted", "declined"]),
            addedAt: z.date(),
            invitedAt: z.date(),
            user: z.object({
              id: z.string(),
              name: z.string(),
              email: z.string().nullable(),
              image: z.string().nullable(),
            }),
          }),
        ),
        owner: z
          .object({
            id: z.string(),
            name: z.string(),
            email: z.string().nullable(),
            image: z.string().nullable(),
          })
          .nullable(),
      }),
    )
    .use(ensureListAtLeastViewer)
    .query(async ({ ctx }) => {
      return await ctx.list.getCollaborators();
    }),

  acceptInvitation: authedProcedure
    .input(
      z.object({
        invitationId: z.string(),
      }),
    )
    .use(ensureInvitationAccess)
    .mutation(async ({ ctx }) => {
      await ctx.invitation.accept();
    }),

  declineInvitation: authedProcedure
    .input(
      z.object({
        invitationId: z.string(),
      }),
    )
    .use(ensureInvitationAccess)
    .mutation(async ({ ctx }) => {
      await ctx.invitation.decline();
    }),

  revokeInvitation: authedProcedure
    .input(
      z.object({
        invitationId: z.string(),
      }),
    )
    .use(ensureInvitationAccess)
    .mutation(async ({ ctx }) => {
      await ctx.invitation.revoke();
    }),

  getPendingInvitations: authedProcedure
    .output(
      z.array(
        z.object({
          id: z.string(),
          listId: z.string(),
          role: z.enum(["viewer", "editor"]),
          invitedAt: z.date(),
          list: z.object({
            id: z.string(),
            name: z.string(),
            icon: z.string(),
            description: z.string().nullable(),
            owner: z
              .object({
                id: z.string(),
                name: z.string(),
                email: z.string(),
              })
              .nullable(),
          }),
        }),
      ),
    )
    .query(async ({ ctx }) => {
      return ListInvitation.pendingForUser(ctx);
    }),

  leaveList: authedProcedure
    .input(
      z.object({
        listId: z.string(),
      }),
    )
    .use(ensureListAtLeastViewer)
    .mutation(async ({ ctx }) => {
      await ctx.list.leaveList();
    }),
});
