import { TRPCError } from "@trpc/server";
import { and, eq, gt, lte } from "drizzle-orm";
import { z } from "zod";

import { bookmarkReminders, bookmarks } from "@karakeep/db/schema";
import {
  zCreateReminderRequestSchema,
  zGetRemindersCountsRequestSchema,
  zGetRemindersCountsResponseSchema,
  zGetRemindersRequestSchema,
  zReminderSchema,
  zUpdateReminderRequestSchema,
} from "@karakeep/shared/types/reminders";
import { getNextReminderTime } from "@karakeep/shared/utils/reminderTimeslotsUtils";

import { authedProcedure, router } from "../index";
import { ensureBookmarkOwnership } from "./bookmarks";

export const remindersRouter = router({
  // Create or update a reminder for a bookmark (upsert behavior due to unique constraint)
  setReminder: authedProcedure
    .input(zCreateReminderRequestSchema)
    .output(zReminderSchema)
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      // Check if user owns the bookmark
      const bookmark = await ctx.db.query.bookmarks.findFirst({
        where: and(
          eq(bookmarks.id, input.bookmarkId),
          eq(bookmarks.userId, ctx.user.id),
        ),
      });

      if (!bookmark) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bookmark not found",
        });
      }

      // Atomic upsert: insert new or update existing reminder
      const [upsertedReminder] = await ctx.db
        .insert(bookmarkReminders)
        .values({
          bookmarkId: input.bookmarkId,
          remindAt: input.remindAt,
          status: "active",
        })
        .onConflictDoUpdate({
          target: bookmarkReminders.bookmarkId,
          set: {
            remindAt: input.remindAt,
            status: "active",
          },
        })
        .returning();

      return {
        id: upsertedReminder.id,
        bookmarkId: upsertedReminder.bookmarkId,
        remindAt: upsertedReminder.remindAt,
        status: upsertedReminder.status as "active" | "dismissed",
        createdAt: upsertedReminder.createdAt,
        modifiedAt: upsertedReminder.modifiedAt,
      };
    }),

  // Update an existing reminder
  updateReminder: authedProcedure
    .input(zUpdateReminderRequestSchema)
    .output(zReminderSchema)
    .mutation(async ({ input, ctx }) => {
      // First get the reminder and verify ownership through bookmark
      const existingReminder = await ctx.db.query.bookmarkReminders.findFirst({
        where: eq(bookmarkReminders.id, input.reminderId),
        with: {
          bookmark: true,
        },
      });

      if (!existingReminder) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Reminder not found",
        });
      }

      if (existingReminder.bookmark.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User is not allowed to access resource",
        });
      }

      const updateData: Partial<{
        remindAt: Date;
        status: "active" | "dismissed";
        modifiedAt: Date;
      }> = {};

      if (input.remindAt !== undefined) {
        updateData.remindAt = input.remindAt;
      }
      if (input.status !== undefined) {
        updateData.status = input.status;
      }

      // This should never happen due to schema validation, but be defensive
      if (Object.keys(updateData).length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No fields provided for update",
        });
      }

      // Always update modifiedAt when making changes
      updateData.modifiedAt = new Date();

      const [updatedReminder] = await ctx.db
        .update(bookmarkReminders)
        .set(updateData)
        .where(eq(bookmarkReminders.id, input.reminderId))
        .returning();

      return {
        id: updatedReminder.id,
        bookmarkId: updatedReminder.bookmarkId,
        remindAt: updatedReminder.remindAt,
        status: updatedReminder.status as "active" | "dismissed",
        createdAt: updatedReminder.createdAt,
        modifiedAt: updatedReminder.modifiedAt,
      };
    }),

  // Delete a reminder
  deleteReminder: authedProcedure
    .input(z.object({ reminderId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // First get the reminder and verify ownership through bookmark
      const existingReminder = await ctx.db.query.bookmarkReminders.findFirst({
        where: eq(bookmarkReminders.id, input.reminderId),
        with: {
          bookmark: true,
        },
      });

      if (!existingReminder) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Reminder not found",
        });
      }

      if (existingReminder.bookmark.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User is not allowed to access resource",
        });
      }

      await ctx.db
        .delete(bookmarkReminders)
        .where(eq(bookmarkReminders.id, input.reminderId));
    }),

  // Get reminders for current user
  getReminders: authedProcedure
    .input(zGetRemindersRequestSchema)
    .output(
      z.object({
        reminders: z.array(zReminderSchema),
      }),
    )
    .query(async ({ input, ctx }) => {
      const conditions = [];

      if (input.bookmarkId) {
        conditions.push(eq(bookmarkReminders.bookmarkId, input.bookmarkId));
      }

      if (input.status) {
        conditions.push(eq(bookmarkReminders.status, input.status));
      }

      // Handle reminder type filtering for reminders page tabs
      if (input.reminderType) {
        const now = input.clientTimestamp
          ? new Date(input.clientTimestamp)
          : new Date();
        switch (input.reminderType) {
          case "due":
            conditions.push(eq(bookmarkReminders.status, "active"));
            conditions.push(lte(bookmarkReminders.remindAt, now));
            break;
          case "upcoming":
            conditions.push(eq(bookmarkReminders.status, "active"));
            conditions.push(gt(bookmarkReminders.remindAt, now));
            break;
          case "dismissed":
            conditions.push(eq(bookmarkReminders.status, "dismissed"));
            break;
        }
      }

      const reminders = await ctx.db
        .select({
          id: bookmarkReminders.id,
          bookmarkId: bookmarkReminders.bookmarkId,
          remindAt: bookmarkReminders.remindAt,
          status: bookmarkReminders.status,
          createdAt: bookmarkReminders.createdAt,
          modifiedAt: bookmarkReminders.modifiedAt,
        })
        .from(bookmarkReminders)
        .innerJoin(bookmarks, eq(bookmarks.id, bookmarkReminders.bookmarkId))
        .where(
          and(
            eq(bookmarks.userId, ctx.user.id), // Ensure user owns the bookmark
            ...conditions,
          ),
        )
        .orderBy(bookmarkReminders.remindAt);

      return {
        reminders: reminders.map((r) => ({
          id: r.id,
          bookmarkId: r.bookmarkId,
          remindAt: r.remindAt,
          status: r.status as "active" | "dismissed",
          createdAt: r.createdAt,
          modifiedAt: r.modifiedAt,
        })),
      };
    }),

  // Get reminder for a specific bookmark (useful for UI to show if reminder exists)
  getBookmarkReminder: authedProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .output(zReminderSchema.nullable())
    .use(ensureBookmarkOwnership)
    .query(async ({ input, ctx }) => {
      const reminder = await ctx.db.query.bookmarkReminders.findFirst({
        where: eq(bookmarkReminders.bookmarkId, input.bookmarkId),
      });

      if (!reminder) {
        return null;
      }

      return {
        id: reminder.id,
        bookmarkId: reminder.bookmarkId,
        remindAt: reminder.remindAt,
        status: reminder.status as "active" | "dismissed",
        createdAt: reminder.createdAt,
        modifiedAt: reminder.modifiedAt,
      };
    }),

  // Snooze a reminder to the next logical time slot
  snoozeReminder: authedProcedure
    .input(
      z.object({
        reminderId: z.string(),
        clientTimestamp: z.number().int().min(0), // Just ensure it's a positive integer timestamp
      }),
    )
    .output(zReminderSchema)
    .mutation(async ({ input, ctx }) => {
      // First get the reminder and verify ownership through bookmark
      const existingReminder = await ctx.db.query.bookmarkReminders.findFirst({
        where: eq(bookmarkReminders.id, input.reminderId),
        with: {
          bookmark: true,
        },
      });

      if (!existingReminder) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Reminder not found",
        });
      }

      if (existingReminder.bookmark.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User is not allowed to access resource",
        });
      }

      // Calculate the next logical reminder time using client timestamp
      const clientTime = new Date(input.clientTimestamp);
      const nextReminderTime = getNextReminderTime(clientTime);

      const [updatedReminder] = await ctx.db
        .update(bookmarkReminders)
        .set({
          remindAt: nextReminderTime,
          status: "active", // Ensure it's active when snoozed
        })
        .where(eq(bookmarkReminders.id, input.reminderId))
        .returning();

      return {
        id: updatedReminder.id,
        bookmarkId: updatedReminder.bookmarkId,
        remindAt: updatedReminder.remindAt,
        status: updatedReminder.status as "active" | "dismissed",
        createdAt: updatedReminder.createdAt,
        modifiedAt: updatedReminder.modifiedAt,
      };
    }),

  // Get all reminder counts in a single query
  getRemindersCounts: authedProcedure
    .input(zGetRemindersCountsRequestSchema)
    .output(zGetRemindersCountsResponseSchema)
    .query(async ({ input, ctx }) => {
      const now = input.clientTimestamp
        ? new Date(input.clientTimestamp)
        : new Date();

      // Fetch all reminders for the user with counts by category
      const allReminders = await ctx.db
        .select({
          remindAt: bookmarkReminders.remindAt,
          status: bookmarkReminders.status,
        })
        .from(bookmarkReminders)
        .innerJoin(bookmarks, eq(bookmarks.id, bookmarkReminders.bookmarkId))
        .where(eq(bookmarks.userId, ctx.user.id));

      // Count reminders by type
      const dueCount = allReminders.filter(
        (r) => r.status === "active" && r.remindAt <= now,
      ).length;

      const upcomingCount = allReminders.filter(
        (r) => r.status === "active" && r.remindAt > now,
      ).length;

      const dismissedCount = allReminders.filter(
        (r) => r.status === "dismissed",
      ).length;

      return {
        dueCount,
        upcomingCount,
        dismissedCount,
      };
    }),
});
