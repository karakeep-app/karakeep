import { TRPCError } from "@trpc/server";
import { z } from "zod";

import serverConfig from "@karakeep/shared/config";
import {
  zResetPasswordSchema,
  zSignUpSchema,
  zUpdateUserSettingsSchema,
  zUserSettingsSchema,
  zUserStatsResponseSchema,
  zWhoAmIResponseSchema,
} from "@karakeep/shared/types/users";

import {
  adminProcedure,
  authedProcedure,
  createRateLimitMiddleware,
  publicProcedure,
  router,
} from "../index";
import { User } from "../models/users";

export const usersAppRouter = router({
  create: publicProcedure
    .use(
      createRateLimitMiddleware({
        name: "users.create",
        windowMs: 60 * 1000,
        maxRequests: 3,
      }),
    )
    .input(zSignUpSchema)
    .output(
      z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        role: z.enum(["user", "admin"]).nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (
        serverConfig.auth.disableSignups ||
        serverConfig.auth.disablePasswordAuth
      ) {
        const errorMessage = serverConfig.auth.disablePasswordAuth
          ? "Local Signups are disabled in the server config. Use OAuth instead!"
          : "Signups are disabled in server config";
        throw new TRPCError({
          code: "FORBIDDEN",
          message: errorMessage,
        });
      }
      const user = await User.create(ctx, input);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      };
    }),
  list: adminProcedure
    .output(
      z.object({
        users: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            role: z.enum(["user", "admin"]).nullable(),
            localUser: z.boolean(),
            bookmarkQuota: z.number().nullable(),
            storageQuota: z.number().nullable(),
          }),
        ),
      }),
    )
    .query(async ({ ctx }) => {
      const users = await User.getAll(ctx);
      return {
        users: users.map((u) => u.asPublicUser()),
      };
    }),
  changePassword: authedProcedure
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = await User.fromCtx(ctx);
      await user.changePassword(input.currentPassword, input.newPassword);
    }),
  delete: adminProcedure
    .input(
      z.object({
        userId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await User.deleteAsAdmin(ctx, input.userId);
    }),
  deleteAccount: authedProcedure
    .input(
      z.object({
        password: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = await User.fromCtx(ctx);
      await user.deleteAccount(input.password);
    }),
  whoami: authedProcedure
    .output(zWhoAmIResponseSchema)
    .query(async ({ ctx }) => {
      const user = await User.fromCtx(ctx);
      return user.asWhoAmI();
    }),
  stats: authedProcedure
    .output(zUserStatsResponseSchema)
    .query(async ({ ctx }) => {
      const user = await User.fromCtx(ctx);
      return await user.getStats();
    }),
  settings: authedProcedure
    .output(zUserSettingsSchema)
    .query(async ({ ctx }) => {
      const user = await User.fromCtx(ctx);
      return await user.getSettings();
    }),
  updateSettings: authedProcedure
    .input(zUpdateUserSettingsSchema)
    .mutation(async ({ input, ctx }) => {
      const user = await User.fromCtx(ctx);
      await user.updateSettings(input);
    }),
  verifyEmail: publicProcedure
    .use(
      createRateLimitMiddleware({
        name: "users.verifyEmail",
        windowMs: 5 * 60 * 1000,
        maxRequests: 10,
      }),
    )
    .input(
      z.object({
        email: z.string().email(),
        token: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await User.verifyEmail(ctx, input.email, input.token);
      return { success: true };
    }),
  resendVerificationEmail: publicProcedure
    .use(
      createRateLimitMiddleware({
        name: "users.resendVerificationEmail",
        windowMs: 5 * 60 * 1000,
        maxRequests: 3,
      }),
    )
    .input(
      z.object({
        email: z.string().email(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await User.resendVerificationEmail(ctx, input.email);
      return { success: true };
    }),
  forgotPassword: publicProcedure
    .use(
      createRateLimitMiddleware({
        name: "users.forgotPassword",
        windowMs: 15 * 60 * 1000,
        maxRequests: 3,
      }),
    )
    .input(
      z.object({
        email: z.string().email(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await User.forgotPassword(ctx, input.email);
      return { success: true };
    }),
  resetPassword: publicProcedure
    .use(
      createRateLimitMiddleware({
        name: "users.resetPassword",
        windowMs: 5 * 60 * 1000,
        maxRequests: 10,
      }),
    )
    .input(zResetPasswordSchema)
    .mutation(async ({ input, ctx }) => {
      await User.resetPassword(ctx, input);
      return { success: true };
    }),
});
