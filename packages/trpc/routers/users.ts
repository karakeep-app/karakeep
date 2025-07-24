import { randomBytes } from "crypto";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import invariant from "tiny-invariant";
import { z } from "zod";

import { SqliteError } from "@karakeep/db";
import {
  assets,
  bookmarkLinks,
  bookmarkLists,
  bookmarks,
  bookmarkTags,
  highlights,
  passwordResetTokens,
  tagsOnBookmarks,
  users,
  userSettings,
  verificationTokens,
} from "@karakeep/db/schema";
import { deleteUserAssets } from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import {
  zResetPasswordSchema,
  zSignUpSchema,
  zUpdateUserSettingsSchema,
  zUserSettingsSchema,
  zUserStatsResponseSchema,
  zWhoAmIResponseSchema,
} from "@karakeep/shared/types/users";

import { generatePasswordSalt, hashPassword, validatePassword } from "../auth";
import { sendPasswordResetEmail, sendVerificationEmail } from "../email";
import {
  adminProcedure,
  authedProcedure,
  Context,
  createRateLimitMiddleware,
  publicProcedure,
  router,
} from "../index";

async function genEmailVerificationToken(db: Context["db"], email: string) {
  const token = randomBytes(10).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Store verification token
  await db.insert(verificationTokens).values({
    identifier: email,
    token,
    expires,
  });

  return token;
}

async function verifyEmailToken(
  db: Context["db"],
  email: string,
  token: string,
): Promise<boolean> {
  const verificationToken = await db.query.verificationTokens.findFirst({
    where: (vt, { and, eq }) =>
      and(eq(vt.identifier, email), eq(vt.token, token)),
  });

  if (!verificationToken) {
    return false;
  }

  if (verificationToken.expires < new Date()) {
    // Clean up expired token
    await db
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, email),
          eq(verificationTokens.token, token),
        ),
      );
    return false;
  }

  // Clean up used token
  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.token, token),
      ),
    );

  return true;
}

export async function createUserRaw(
  db: Context["db"],
  input: {
    name: string;
    email: string;
    password?: string;
    salt?: string;
    role?: "user" | "admin";
    emailVerified?: Date | null;
  },
) {
  return await db.transaction(async (trx) => {
    let userRole = input.role;
    if (!userRole) {
      const [{ count: userCount }] = await trx
        .select({ count: count() })
        .from(users);
      userRole = userCount == 0 ? "admin" : "user";
    }

    try {
      const [result] = await trx
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          password: input.password,
          salt: input.salt,
          role: userRole,
          emailVerified: input.emailVerified,
          bookmarkQuota: serverConfig.quotas.free.bookmarkLimit,
          storageQuota: serverConfig.quotas.free.assetSizeBytes,
        })
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          emailVerified: users.emailVerified,
        });

      // Insert user settings for the new user
      await trx.insert(userSettings).values({
        userId: result.id,
      });

      return result;
    } catch (e) {
      if (e instanceof SqliteError) {
        if (e.code == "SQLITE_CONSTRAINT_UNIQUE") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Email is already taken",
          });
        }
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong",
      });
    }
  });
}

export async function createUser(
  input: z.infer<typeof zSignUpSchema>,
  ctx: Context,
  role?: "user" | "admin",
) {
  const salt = generatePasswordSalt();
  let user = await createUserRaw(ctx.db, {
    name: input.name,
    email: input.email,
    password: await hashPassword(input.password, salt),
    salt,
    role,
  });
  // Send verification email if required
  if (serverConfig.auth.emailVerificationRequired) {
    const token = await genEmailVerificationToken(ctx.db, input.email);
    try {
      await sendVerificationEmail(input.email, input.name, token);
    } catch (error) {
      console.error("Failed to send verification email:", error);
      // Don't fail user creation if email sending fails
    }
  }
  return user;
}

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
      return createUser(input, ctx);
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
      const dbUsers = await ctx.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          password: users.password,
          bookmarkQuota: users.bookmarkQuota,
          storageQuota: users.storageQuota,
        })
        .from(users);

      return {
        users: dbUsers.map(({ password, ...user }) => ({
          ...user,
          localUser: password !== null,
        })),
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
      invariant(ctx.user.email, "A user always has an email specified");
      let user;
      try {
        user = await validatePassword(
          ctx.user.email,
          input.currentPassword,
          ctx.db,
        );
      } catch {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      invariant(user.id, ctx.user.id);
      const newSalt = generatePasswordSalt();
      await ctx.db
        .update(users)
        .set({
          password: await hashPassword(input.newPassword, newSalt),
          salt: newSalt,
        })
        .where(eq(users.id, ctx.user.id));
    }),
  delete: adminProcedure
    .input(
      z.object({
        userId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const res = await ctx.db.delete(users).where(eq(users.id, input.userId));
      if (res.changes == 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await deleteUserAssets({ userId: input.userId });
    }),
  deleteAccount: authedProcedure
    .input(
      z.object({
        password: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      invariant(ctx.user.email, "A user always has an email specified");

      // Check if user has a password (local account)
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.user.id),
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // If user has a password, verify it before allowing account deletion
      if (user.password) {
        if (!input.password) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Password is required for local accounts",
          });
        }

        try {
          await validatePassword(ctx.user.email, input.password, ctx.db);
        } catch {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid password",
          });
        }
      }

      // Delete the user account
      const res = await ctx.db.delete(users).where(eq(users.id, ctx.user.id));
      if (res.changes == 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Delete user assets
      await deleteUserAssets({ userId: ctx.user.id });
    }),
  whoami: authedProcedure
    .output(zWhoAmIResponseSchema)
    .query(async ({ ctx }) => {
      if (!ctx.user.email) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const userDb = await ctx.db.query.users.findFirst({
        where: and(eq(users.id, ctx.user.id), eq(users.email, ctx.user.email)),
      });
      if (!userDb) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      return {
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
        localUser: userDb.password !== null,
      };
    }),
  stats: authedProcedure
    .output(zUserStatsResponseSchema)
    .query(async ({ ctx }) => {
      // Get user's timezone
      const userSet = await ctx.db.query.userSettings.findFirst({
        where: eq(userSettings.userId, ctx.user.id),
      });
      const userTimezone = userSet?.timezone || "UTC";
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      const [
        [{ numBookmarks }],
        [{ numFavorites }],
        [{ numArchived }],
        [{ numTags }],
        [{ numLists }],
        [{ numHighlights }],
        bookmarksByType,
        topDomains,
        [{ totalAssetSize }],
        assetsByType,
        [{ thisWeek }],
        [{ thisMonth }],
        [{ thisYear }],
        bookmarkTimestamps,
        tagUsage,
      ] = await Promise.all([
        // Basic counts
        ctx.db
          .select({ numBookmarks: count() })
          .from(bookmarks)
          .where(eq(bookmarks.userId, ctx.user.id)),
        ctx.db
          .select({ numFavorites: count() })
          .from(bookmarks)
          .where(
            and(
              eq(bookmarks.userId, ctx.user.id),
              eq(bookmarks.favourited, true),
            ),
          ),
        ctx.db
          .select({ numArchived: count() })
          .from(bookmarks)
          .where(
            and(
              eq(bookmarks.userId, ctx.user.id),
              eq(bookmarks.archived, true),
            ),
          ),
        ctx.db
          .select({ numTags: count() })
          .from(bookmarkTags)
          .where(eq(bookmarkTags.userId, ctx.user.id)),
        ctx.db
          .select({ numLists: count() })
          .from(bookmarkLists)
          .where(eq(bookmarkLists.userId, ctx.user.id)),
        ctx.db
          .select({ numHighlights: count() })
          .from(highlights)
          .where(eq(highlights.userId, ctx.user.id)),

        // Bookmarks by type
        ctx.db
          .select({
            type: bookmarks.type,
            count: count(),
          })
          .from(bookmarks)
          .where(eq(bookmarks.userId, ctx.user.id))
          .groupBy(bookmarks.type),

        // Top domains
        ctx.db
          .select({
            domain: sql<string>`CASE 
              WHEN ${bookmarkLinks.url} LIKE 'https://%' THEN 
                CASE 
                  WHEN INSTR(SUBSTR(${bookmarkLinks.url}, 9), '/') > 0 THEN
                    SUBSTR(${bookmarkLinks.url}, 9, INSTR(SUBSTR(${bookmarkLinks.url}, 9), '/') - 1)
                  ELSE
                    SUBSTR(${bookmarkLinks.url}, 9)
                END
              WHEN ${bookmarkLinks.url} LIKE 'http://%' THEN 
                CASE 
                  WHEN INSTR(SUBSTR(${bookmarkLinks.url}, 8), '/') > 0 THEN
                    SUBSTR(${bookmarkLinks.url}, 8, INSTR(SUBSTR(${bookmarkLinks.url}, 8), '/') - 1)
                  ELSE
                    SUBSTR(${bookmarkLinks.url}, 8)
                END
              ELSE 
                CASE 
                  WHEN INSTR(${bookmarkLinks.url}, '/') > 0 THEN
                    SUBSTR(${bookmarkLinks.url}, 1, INSTR(${bookmarkLinks.url}, '/') - 1)
                  ELSE
                    ${bookmarkLinks.url}
                END
            END`,
            count: count(),
          })
          .from(bookmarkLinks)
          .innerJoin(bookmarks, eq(bookmarks.id, bookmarkLinks.id))
          .where(eq(bookmarks.userId, ctx.user.id))
          .groupBy(
            sql`CASE 
            WHEN ${bookmarkLinks.url} LIKE 'https://%' THEN 
              CASE 
                WHEN INSTR(SUBSTR(${bookmarkLinks.url}, 9), '/') > 0 THEN
                  SUBSTR(${bookmarkLinks.url}, 9, INSTR(SUBSTR(${bookmarkLinks.url}, 9), '/') - 1)
                ELSE
                  SUBSTR(${bookmarkLinks.url}, 9)
              END
            WHEN ${bookmarkLinks.url} LIKE 'http://%' THEN 
              CASE 
                WHEN INSTR(SUBSTR(${bookmarkLinks.url}, 8), '/') > 0 THEN
                  SUBSTR(${bookmarkLinks.url}, 8, INSTR(SUBSTR(${bookmarkLinks.url}, 8), '/') - 1)
                ELSE
                  SUBSTR(${bookmarkLinks.url}, 8)
              END
            ELSE 
              CASE 
                WHEN INSTR(${bookmarkLinks.url}, '/') > 0 THEN
                  SUBSTR(${bookmarkLinks.url}, 1, INSTR(${bookmarkLinks.url}, '/') - 1)
                ELSE
                  ${bookmarkLinks.url}
              END
          END`,
          )
          .orderBy(desc(count()))
          .limit(10),

        // Total asset size
        ctx.db
          .select({
            totalAssetSize: sql<number>`COALESCE(SUM(${assets.size}), 0)`,
          })
          .from(assets)
          .where(eq(assets.userId, ctx.user.id)),

        // Assets by type
        ctx.db
          .select({
            type: assets.assetType,
            count: count(),
            totalSize: sql<number>`COALESCE(SUM(${assets.size}), 0)`,
          })
          .from(assets)
          .where(eq(assets.userId, ctx.user.id))
          .groupBy(assets.assetType),

        // Activity stats
        ctx.db
          .select({ thisWeek: count() })
          .from(bookmarks)
          .where(
            and(
              eq(bookmarks.userId, ctx.user.id),
              gte(bookmarks.createdAt, weekAgo),
            ),
          ),
        ctx.db
          .select({ thisMonth: count() })
          .from(bookmarks)
          .where(
            and(
              eq(bookmarks.userId, ctx.user.id),
              gte(bookmarks.createdAt, monthAgo),
            ),
          ),
        ctx.db
          .select({ thisYear: count() })
          .from(bookmarks)
          .where(
            and(
              eq(bookmarks.userId, ctx.user.id),
              gte(bookmarks.createdAt, yearAgo),
            ),
          ),

        // Get all bookmark timestamps for timezone conversion
        ctx.db
          .select({
            createdAt: bookmarks.createdAt,
          })
          .from(bookmarks)
          .where(eq(bookmarks.userId, ctx.user.id)),

        // Tag usage
        ctx.db
          .select({
            name: bookmarkTags.name,
            count: count(),
          })
          .from(bookmarkTags)
          .innerJoin(
            tagsOnBookmarks,
            eq(tagsOnBookmarks.tagId, bookmarkTags.id),
          )
          .where(eq(bookmarkTags.userId, ctx.user.id))
          .groupBy(bookmarkTags.name)
          .orderBy(desc(count()))
          .limit(10),
      ]);

      // Process bookmarks by type
      const bookmarkTypeMap = { link: 0, text: 0, asset: 0 };
      bookmarksByType.forEach((item) => {
        if (item.type in bookmarkTypeMap) {
          bookmarkTypeMap[item.type as keyof typeof bookmarkTypeMap] =
            item.count;
        }
      });

      // Process timestamps with user timezone
      const hourCounts = Array.from({ length: 24 }, () => 0);
      const dayCounts = Array.from({ length: 7 }, () => 0);

      bookmarkTimestamps.forEach(({ createdAt }) => {
        if (createdAt) {
          // Convert timestamp to user timezone
          const date = new Date(createdAt);
          const userDate = new Date(
            date.toLocaleString("en-US", { timeZone: userTimezone }),
          );

          const hour = userDate.getHours();
          const day = userDate.getDay();

          hourCounts[hour]++;
          dayCounts[day]++;
        }
      });

      const hourlyActivity = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        count: hourCounts[i],
      }));

      const dailyActivity = Array.from({ length: 7 }, (_, i) => ({
        day: i,
        count: dayCounts[i],
      }));

      return {
        numBookmarks,
        numFavorites,
        numArchived,
        numTags,
        numLists,
        numHighlights,
        bookmarksByType: bookmarkTypeMap,
        topDomains: topDomains.filter((d) => d.domain && d.domain.length > 0),
        totalAssetSize: totalAssetSize || 0,
        assetsByType,
        bookmarkingActivity: {
          thisWeek: thisWeek || 0,
          thisMonth: thisMonth || 0,
          thisYear: thisYear || 0,
          byHour: hourlyActivity,
          byDayOfWeek: dailyActivity,
        },
        tagUsage,
      };
    }),
  settings: authedProcedure
    .output(zUserSettingsSchema)
    .query(async ({ ctx }) => {
      const settings = await ctx.db.query.userSettings.findFirst({
        where: eq(userSettings.userId, ctx.user.id),
      });
      if (!settings) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User settings not found",
        });
      }
      return {
        bookmarkClickAction: settings.bookmarkClickAction,
        archiveDisplayBehaviour: settings.archiveDisplayBehaviour,
        timezone: settings.timezone || "UTC",
      };
    }),
  updateSettings: authedProcedure
    .input(zUpdateUserSettingsSchema)
    .mutation(async ({ input, ctx }) => {
      if (Object.keys(input).length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No settings provided",
        });
      }
      await ctx.db
        .update(userSettings)
        .set({
          bookmarkClickAction: input.bookmarkClickAction,
          archiveDisplayBehaviour: input.archiveDisplayBehaviour,
          timezone: input.timezone,
        })
        .where(eq(userSettings.userId, ctx.user.id));
    }),
  verifyEmail: publicProcedure
    .use(
      createRateLimitMiddleware({
        name: "users.verifyEmail",
        windowMs: 5 * 60 * 1000,
        maxRequests: 10,
      }),
    ) // 10 requests per 5 minutes
    .input(
      z.object({
        email: z.string().email(),
        token: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const isValid = await verifyEmailToken(ctx.db, input.email, input.token);
      if (!isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or expired verification token",
        });
      }

      // Update user's emailVerified status
      const result = await ctx.db
        .update(users)
        .set({ emailVerified: new Date() })
        .where(eq(users.email, input.email));

      if (result.changes === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return { success: true };
    }),
  resendVerificationEmail: publicProcedure
    .use(
      createRateLimitMiddleware({
        name: "users.resendVerificationEmail",
        windowMs: 5 * 60 * 1000,
        maxRequests: 3,
      }),
    ) // 3 requests per 5 minutes
    .input(
      z.object({
        email: z.string().email(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (
        !serverConfig.auth.emailVerificationRequired ||
        !serverConfig.email.smtp
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email verification is not enabled",
        });
      }

      const user = await ctx.db.query.users.findFirst({
        where: eq(users.email, input.email),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      if (user.emailVerified) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email is already verified",
        });
      }

      const token = await genEmailVerificationToken(ctx.db, input.email);
      try {
        await sendVerificationEmail(input.email, user.name, token);
        return { success: true };
      } catch (error) {
        console.error("Failed to send verification email:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send verification email",
        });
      }
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
      if (!serverConfig.email.smtp) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email service is not configured",
        });
      }

      const user = await ctx.db.query.users.findFirst({
        where: eq(users.email, input.email),
      });

      if (!user) {
        // Don't reveal if user exists or not for security
        return { success: true };
      }

      // Only send reset email for users with passwords (local accounts)
      if (!user.password) {
        return { success: true };
      }

      try {
        const token = randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Store password reset token
        await ctx.db.insert(passwordResetTokens).values({
          userId: user.id,
          token,
          expires,
        });

        await sendPasswordResetEmail(input.email, user.name, token);
        return { success: true };
      } catch (error) {
        console.error("Failed to send password reset email:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send password reset email",
        });
      }
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
      const token = input.token;
      const resetToken = await ctx.db.query.passwordResetTokens.findFirst({
        where: eq(passwordResetTokens.token, token),
        with: {
          user: {
            columns: {
              id: true,
            },
          },
        },
      });

      if (!resetToken) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or expired reset token",
        });
      }

      if (resetToken.expires < new Date()) {
        // Clean up expired token
        await ctx.db
          .delete(passwordResetTokens)
          .where(eq(passwordResetTokens.token, token));
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or expired reset token",
        });
      }

      if (!resetToken.user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Generate new password hash
      const newSalt = generatePasswordSalt();
      const hashedPassword = await hashPassword(input.newPassword, newSalt);

      // Update user password
      await ctx.db
        .update(users)
        .set({
          password: hashedPassword,
          salt: newSalt,
        })
        .where(eq(users.id, resetToken.user.id));

      await ctx.db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.token, token));
      return { success: true };
    }),
});
