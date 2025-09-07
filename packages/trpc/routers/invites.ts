import { randomBytes } from "crypto";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { invites, users } from "@karakeep/db/schema";

import { generatePasswordSalt, hashPassword } from "../auth";
import { sendInviteEmail } from "../email";
import {
  adminProcedure,
  createRateLimitMiddleware,
  publicProcedure,
  router,
} from "../index";
import { User } from "../models/users";

export const invitesAppRouter = router({
  create: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const existingUser = await ctx.db.query.users.findFirst({
        where: eq(users.email, input.email),
      });

      if (existingUser) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User with this email already exists",
        });
      }

      const existingInvite = await ctx.db.query.invites.findFirst({
        where: eq(invites.email, input.email),
      });

      if (existingInvite) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An active invite for this email already exists",
        });
      }

      const token = randomBytes(32).toString("hex");

      const [invite] = await ctx.db
        .insert(invites)
        .values({
          email: input.email,
          token,
          invitedBy: ctx.user.id,
        })
        .returning();

      // Send invite email
      try {
        await sendInviteEmail(
          input.email,
          token,
          ctx.user.name || "A Karakeep admin",
        );
      } catch (error) {
        console.error("Failed to send invite email:", error);
        // Don't fail the invite creation if email sending fails
      }

      return {
        id: invite.id,
        email: invite.email,
      };
    }),

  list: adminProcedure
    .output(
      z.object({
        invites: z.array(
          z.object({
            id: z.string(),
            email: z.string(),
            createdAt: z.date(),
            invitedBy: z.object({
              id: z.string(),
              name: z.string(),
              email: z.string(),
            }),
          }),
        ),
      }),
    )
    .query(async ({ ctx }) => {
      const dbInvites = await ctx.db.query.invites.findMany({
        with: {
          invitedBy: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: (invites, { desc }) => [desc(invites.createdAt)],
      });

      return {
        invites: dbInvites,
      };
    }),

  get: publicProcedure
    .use(
      createRateLimitMiddleware({
        name: "invites.get",
        windowMs: 60 * 1000,
        maxRequests: 10,
      }),
    )
    .input(
      z.object({
        token: z.string(),
      }),
    )
    .output(
      z.object({
        email: z.string(),
        expired: z.boolean(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const invite = await ctx.db.query.invites.findFirst({
        where: eq(invites.token, input.token),
      });

      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found or has been used",
        });
      }

      return {
        email: invite.email,
        expired: false,
      };
    }),

  accept: publicProcedure
    .use(
      createRateLimitMiddleware({
        name: "invites.accept",
        windowMs: 60 * 1000,
        maxRequests: 10,
      }),
    )
    .input(
      z.object({
        token: z.string(),
        name: z.string().min(1),
        password: z.string().min(8),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const invite = await ctx.db.query.invites.findFirst({
        where: eq(invites.token, input.token),
      });

      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found or has been used",
        });
      }

      const existingUser = await ctx.db.query.users.findFirst({
        where: eq(users.email, invite.email),
      });

      if (existingUser) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User with this email already exists",
        });
      }

      const salt = generatePasswordSalt();
      const user = await User.createRaw(ctx.db, {
        name: input.name,
        email: invite.email,
        password: await hashPassword(input.password, salt),
        salt,
        role: "user",
        emailVerified: new Date(), // Auto-verify invited users
      });

      // Delete the invite after successful user creation
      await ctx.db.delete(invites).where(eq(invites.id, invite.id));

      return {
        id: user.id,
        name: user.name,
        email: user.email,
      };
    }),

  revoke: adminProcedure
    .input(
      z.object({
        inviteId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const invite = await ctx.db.query.invites.findFirst({
        where: eq(invites.id, input.inviteId),
      });

      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found",
        });
      }

      // Delete the invite to revoke it
      await ctx.db.delete(invites).where(eq(invites.id, input.inviteId));

      return { success: true };
    }),

  resend: adminProcedure
    .input(
      z.object({
        inviteId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const invite = await ctx.db.query.invites.findFirst({
        where: eq(invites.id, input.inviteId),
      });

      if (!invite) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found",
        });
      }

      const newToken = randomBytes(32).toString("hex");

      await ctx.db
        .update(invites)
        .set({
          token: newToken,
        })
        .where(eq(invites.id, input.inviteId));

      // Send invite email with new token
      try {
        await sendInviteEmail(
          invite.email,
          newToken,
          ctx.user.name || "A Karakeep admin",
        );
      } catch (error) {
        console.error("Failed to send invite email:", error);
        // Don't fail the resend if email sending fails
      }

      return {
        id: invite.id,
        email: invite.email,
      };
    }),
});
