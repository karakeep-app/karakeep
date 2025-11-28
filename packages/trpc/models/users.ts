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

import { AuthedContext, Context } from "..";
import { generatePasswordSalt, hashPassword, validatePassword } from "../auth";
import { sendPasswordResetEmail, sendVerificationEmail } from "../email";

export class User {
  constructor(
    protected ctx: AuthedContext,
    public user: typeof users.$inferSelect,
  ) {}

  static async fromId_DANGEROUS(ctx: AuthedContext, id: string): Promise<User> {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    return new User(ctx, user);
  }

  static async fromCtx(ctx: AuthedContext): Promise<User> {
    return this.fromId_DANGEROUS(ctx, ctx.user.id);
  }

  static async create(
    ctx: Context,
    input: z.infer<typeof zSignUpSchema>,
    role?: "user" | "admin",
  ) {
    const salt = generatePasswordSalt();
    const user = await User.createRaw(ctx.db, {
      name: input.name,
      email: input.email,
      password: await hashPassword(input.password, salt),
      salt,
      role,
    });

    if (serverConfig.auth.emailVerificationRequired) {
      const token = await User.genEmailVerificationToken(ctx.db, input.email);
      try {
        await sendVerificationEmail(input.email, input.name, token);
      } catch (error) {
        console.error("Failed to send verification email:", error);
      }
    }

    return user;
  }

  static async createRaw(
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
        userRole = userCount === 0 ? "admin" : "user";
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
          .returning();

        return result;
      } catch (e) {
        if (e instanceof SqliteError) {
          if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
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

  static async getAll(ctx: AuthedContext): Promise<User[]> {
    const dbUsers = await ctx.db.select().from(users);

    return dbUsers.map((u) => new User(ctx, u));
  }

  static async genEmailVerificationToken(
    db: Context["db"],
    email: string,
  ): Promise<string> {
    const token = randomBytes(10).toString("hex");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.insert(verificationTokens).values({
      identifier: email,
      token,
      expires,
    });

    return token;
  }

  static async verifyEmailToken(
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

  static async verifyEmail(
    ctx: Context,
    email: string,
    token: string,
  ): Promise<void> {
    const isValid = await User.verifyEmailToken(ctx.db, email, token);
    if (!isValid) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid or expired verification token",
      });
    }

    const result = await ctx.db
      .update(users)
      .set({ emailVerified: new Date() })
      .where(eq(users.email, email));

    if (result.changes === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }
  }

  static async resendVerificationEmail(
    ctx: Context,
    email: string,
  ): Promise<void> {
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
      where: eq(users.email, email),
    });

    if (!user) {
      return; // Don't reveal if user exists or not for security
    }

    if (user.emailVerified) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Email is already verified",
      });
    }

    const token = await User.genEmailVerificationToken(ctx.db, email);
    try {
      await sendVerificationEmail(email, user.name, token);
    } catch (error) {
      console.error("Failed to send verification email:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to send verification email",
      });
    }
  }

  static async forgotPassword(ctx: Context, email: string): Promise<void> {
    if (!serverConfig.email.smtp) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Email service is not configured",
      });
    }

    const user = await ctx.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user || !user.password) {
      return; // Don't reveal if user exists or not for security
    }

    try {
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await ctx.db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expires,
      });

      await sendPasswordResetEmail(email, user.name, token);
    } catch (error) {
      console.error("Failed to send password reset email:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to send password reset email",
      });
    }
  }

  static async resetPassword(
    ctx: Context,
    input: z.infer<typeof zResetPasswordSchema>,
  ): Promise<void> {
    const resetToken = await ctx.db.query.passwordResetTokens.findFirst({
      where: eq(passwordResetTokens.token, input.token),
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
      await ctx.db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.token, input.token));
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

    const newSalt = generatePasswordSalt();
    const hashedPassword = await hashPassword(input.newPassword, newSalt);

    await ctx.db
      .update(users)
      .set({
        password: hashedPassword,
        salt: newSalt,
      })
      .where(eq(users.id, resetToken.user.id));

    await ctx.db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.token, input.token));
  }

  private static async deleteInternal(db: Context["db"], userId: string) {
    const res = await db.delete(users).where(eq(users.id, userId));

    if (res.changes === 0) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    await deleteUserAssets({ userId: userId });
  }

  static async deleteAsAdmin(
    adminCtx: AuthedContext,
    userId: string,
  ): Promise<void> {
    invariant(adminCtx.user.role === "admin", "Only admins can delete users");
    await this.deleteInternal(adminCtx.db, userId);
  }

  async deleteAccount(password?: string): Promise<void> {
    invariant(this.ctx.user.email, "A user always has an email specified");

    if (this.user.password) {
      if (!password) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Password is required for local accounts",
        });
      }

      try {
        await validatePassword(this.ctx.user.email, password, this.ctx.db);
      } catch {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid password",
        });
      }
    }

    await User.deleteInternal(this.ctx.db, this.user.id);
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    invariant(this.ctx.user.email, "A user always has an email specified");

    try {
      const user = await validatePassword(
        this.ctx.user.email,
        currentPassword,
        this.ctx.db,
      );
      invariant(user.id === this.ctx.user.id);
    } catch {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const newSalt = generatePasswordSalt();
    await this.ctx.db
      .update(users)
      .set({
        password: await hashPassword(newPassword, newSalt),
        salt: newSalt,
      })
      .where(eq(users.id, this.user.id));
  }

  async getSettings(): Promise<z.infer<typeof zUserSettingsSchema>> {
    const settings = await this.ctx.db.query.users.findFirst({
      where: eq(users.id, this.user.id),
      columns: {
        bookmarkClickAction: true,
        archiveDisplayBehaviour: true,
        timezone: true,
        backupsEnabled: true,
        backupsFrequency: true,
        backupsRetentionDays: true,
      },
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
      backupsEnabled: settings.backupsEnabled,
      backupsFrequency: settings.backupsFrequency,
      backupsRetentionDays: settings.backupsRetentionDays,
    };
  }

  async updateSettings(
    input: z.infer<typeof zUpdateUserSettingsSchema>,
  ): Promise<void> {
    if (Object.keys(input).length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No settings provided",
      });
    }

    await this.ctx.db
      .update(users)
      .set({
        bookmarkClickAction: input.bookmarkClickAction,
        archiveDisplayBehaviour: input.archiveDisplayBehaviour,
        timezone: input.timezone,
        backupsEnabled: input.backupsEnabled,
        backupsFrequency: input.backupsFrequency,
        backupsRetentionDays: input.backupsRetentionDays,
      })
      .where(eq(users.id, this.user.id));
  }

  async getStats(): Promise<z.infer<typeof zUserStatsResponseSchema>> {
    const userObj = await this.ctx.db.query.users.findFirst({
      where: eq(users.id, this.user.id),
      columns: {
        timezone: true,
      },
    });
    const userTimezone = userObj?.timezone || "UTC";
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
      bookmarksBySource,
    ] = await Promise.all([
      // Basic counts
      this.ctx.db
        .select({ numBookmarks: count() })
        .from(bookmarks)
        .where(eq(bookmarks.userId, this.user.id)),
      this.ctx.db
        .select({ numFavorites: count() })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, this.user.id),
            eq(bookmarks.favourited, true),
          ),
        ),
      this.ctx.db
        .select({ numArchived: count() })
        .from(bookmarks)
        .where(
          and(eq(bookmarks.userId, this.user.id), eq(bookmarks.archived, true)),
        ),
      this.ctx.db
        .select({ numTags: count() })
        .from(bookmarkTags)
        .where(eq(bookmarkTags.userId, this.user.id)),
      this.ctx.db
        .select({ numLists: count() })
        .from(bookmarkLists)
        .where(eq(bookmarkLists.userId, this.user.id)),
      this.ctx.db
        .select({ numHighlights: count() })
        .from(highlights)
        .where(eq(highlights.userId, this.user.id)),

      // Bookmarks by type
      this.ctx.db
        .select({
          type: bookmarks.type,
          count: count(),
        })
        .from(bookmarks)
        .where(eq(bookmarks.userId, this.user.id))
        .groupBy(bookmarks.type),

      // Top domains
      this.ctx.db
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
        .where(eq(bookmarks.userId, this.user.id))
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
      this.ctx.db
        .select({
          totalAssetSize: sql<number>`COALESCE(SUM(${assets.size}), 0)`,
        })
        .from(assets)
        .where(eq(assets.userId, this.user.id)),

      // Assets by type
      this.ctx.db
        .select({
          type: assets.assetType,
          count: count(),
          totalSize: sql<number>`COALESCE(SUM(${assets.size}), 0)`,
        })
        .from(assets)
        .where(eq(assets.userId, this.user.id))
        .groupBy(assets.assetType),

      // Activity stats
      this.ctx.db
        .select({ thisWeek: count() })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, this.user.id),
            gte(bookmarks.createdAt, weekAgo),
          ),
        ),
      this.ctx.db
        .select({ thisMonth: count() })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, this.user.id),
            gte(bookmarks.createdAt, monthAgo),
          ),
        ),
      this.ctx.db
        .select({ thisYear: count() })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, this.user.id),
            gte(bookmarks.createdAt, yearAgo),
          ),
        ),

      // Get all bookmark timestamps for timezone conversion
      this.ctx.db
        .select({
          createdAt: bookmarks.createdAt,
        })
        .from(bookmarks)
        .where(eq(bookmarks.userId, this.user.id)),

      // Tag usage
      this.ctx.db
        .select({
          name: bookmarkTags.name,
          count: count(),
        })
        .from(bookmarkTags)
        .innerJoin(tagsOnBookmarks, eq(tagsOnBookmarks.tagId, bookmarkTags.id))
        .where(eq(bookmarkTags.userId, this.user.id))
        .groupBy(bookmarkTags.name)
        .orderBy(desc(count()))
        .limit(10),

      // Bookmarks by source
      this.ctx.db
        .select({
          source: bookmarks.source,
          count: count(),
        })
        .from(bookmarks)
        .where(eq(bookmarks.userId, this.user.id))
        .groupBy(bookmarks.source)
        .orderBy(desc(count())),
    ]);

    // Process bookmarks by type
    const bookmarkTypeMap = { link: 0, text: 0, asset: 0 };
    bookmarksByType.forEach((item) => {
      if (item.type in bookmarkTypeMap) {
        bookmarkTypeMap[item.type as keyof typeof bookmarkTypeMap] = item.count;
      }
    });

    // Process timestamps with user timezone
    const hourCounts = Array.from({ length: 24 }, () => 0);
    const dayCounts = Array.from({ length: 7 }, () => 0);

    bookmarkTimestamps.forEach(({ createdAt }) => {
      if (createdAt) {
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
      bookmarksBySource,
    };
  }

  asWhoAmI(): z.infer<typeof zWhoAmIResponseSchema> {
    return {
      id: this.user.id,
      name: this.user.name,
      email: this.user.email,
      localUser: this.user.password !== null,
    };
  }

  asPublicUser() {
    const { password, salt: _salt, ...rest } = this.user;
    return {
      ...rest,
      localUser: password !== null,
    };
  }
}
