import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { addLogFields } from "@karakeep/shared-server";
import { zAdminUserSchema } from "@karakeep/shared/types/admin";
import {
  zUpdateUserSettingsSchema,
  zUserSettingsSchema,
  zUserBookmarkCountsResponseSchema,
  zUserStatsResponseSchema,
  zWhoAmIResponseSchema,
  zWrappedStatsResponseSchema,
} from "@karakeep/shared/types/users";

import {
  createAdminScopedProcedure,
  createEventLogMiddleware,
  createScopedAuthedProcedure,
  router,
} from "../index";
import { User } from "../models/users";

const usersProcedure = createScopedAuthedProcedure("users");
const adminUsersProcedure = createAdminScopedProcedure("users");

export const usersAppRouter = router({
  list: adminUsersProcedure
    .output(
      z.object({
        users: z.array(zAdminUserSchema),
      }),
    )
    .query(async ({ ctx }) => {
      const users = await User.getAll(ctx);
      return {
        users: users.map((u) => u.user),
      };
    }),
  delete: adminUsersProcedure
    .use(createEventLogMiddleware("user.delete"))
    .input(
      z.object({
        userId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.id == input.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete own account as an admin",
        });
      }
      addLogFields<"user.delete">({
        "user.deleted_id": input.userId,
        "user.deleted_by": "admin",
      });
      await User.deleteAsAdmin(ctx, input.userId);
    }),
  deleteAccount: usersProcedure
    .use(createEventLogMiddleware("user.delete"))
    .input(
      z.object({
        password: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      addLogFields<"user.delete">({
        "user.deleted_id": ctx.user.id,
        "user.deleted_by": "self",
      });
      const user = await User.fromCtx(ctx);
      await user.deleteAccount(input.password);
    }),
  whoami: usersProcedure
    .output(zWhoAmIResponseSchema)
    .query(async ({ ctx }) => {
      const user = await User.fromCtx(ctx);
      return await user.asWhoAmI();
    }),
  bookmarkCounts: usersProcedure
    .output(zUserBookmarkCountsResponseSchema)
    .query(async ({ ctx }) => {
      const user = await User.fromCtx(ctx);
      return await user.getBookmarkCounts();
    }),
  stats: usersProcedure
    .output(zUserStatsResponseSchema)
    .query(async ({ ctx }) => {
      const user = await User.fromCtx(ctx);
      return await user.getStats();
    }),
  wrapped: usersProcedure.output(zWrappedStatsResponseSchema).query(() => {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This endpoint is currently disabled",
    });
  }),
  hasWrapped: usersProcedure.output(z.boolean()).query(() => {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This endpoint is currently disabled",
    });
  }),
  settings: usersProcedure
    .output(zUserSettingsSchema)
    .query(async ({ ctx }) => {
      const user = await User.fromCtx(ctx);
      return await user.getSettings();
    }),
  updateSettings: usersProcedure
    .input(zUpdateUserSettingsSchema)
    .mutation(async ({ input, ctx }) => {
      const user = await User.fromCtx(ctx);
      await user.updateSettings(input);
    }),
  updateAvatar: usersProcedure
    .input(
      z.object({
        assetId: z.string().nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = await User.fromCtx(ctx);
      await user.updateAvatar(input.assetId);
    }),
});
