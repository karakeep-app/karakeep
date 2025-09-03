import { TRPCError } from "@trpc/server";
import { and, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";

import { bookmarkReminders, bookmarks } from "@karakeep/db/schema";
import {
  zCreateReminderRequestSchema,
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

      // Check if a reminder already exists for this bookmark
      const existingReminder = await ctx.db.query.bookmarkReminders.findFirst({
        where: eq(bookmarkReminders.bookmarkId, input.bookmarkId),
      });

      if (existingReminder) {
        // Update the existing reminder
        const [updatedReminder] = await ctx.db
          .update(bookmarkReminders)
          .set({
            remindAt: input.remindAt,
            status: "active", // Always set to active when updated
          })
          .where(eq(bookmarkReminders.bookmarkId, input.bookmarkId))
          .returning();

        return {
          id: updatedReminder.id,
          bookmarkId: updatedReminder.bookmarkId,
          remindAt: updatedReminder.remindAt,
          status: updatedReminder.status as "active" | "dismissed",
          createdAt: updatedReminder.createdAt,
          modifiedAt: updatedReminder.modifiedAt,
        };
      } else {
        // Create a new reminder
        const [newReminder] = await ctx.db
          .insert(bookmarkReminders)
          .values({
            bookmarkId: input.bookmarkId,
            remindAt: input.remindAt,
            status: "active",
          })
          .returning();

        return {
          id: newReminder.id,
          bookmarkId: newReminder.bookmarkId,
          remindAt: newReminder.remindAt,
          status: newReminder.status as "active" | "dismissed",
          createdAt: newReminder.createdAt,
          modifiedAt: newReminder.modifiedAt,
        };
      }
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
      }> = {};

      if (input.remindAt !== undefined) {
        updateData.remindAt = input.remindAt;
      }
      if (input.status !== undefined) {
        updateData.status = input.status;
      }

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
        const now = new Date();
        switch (input.reminderType) {
          case "due":
            conditions.push(eq(bookmarkReminders.status, "active"));
            conditions.push(lt(bookmarkReminders.remindAt, now));
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
    .input(z.object({ reminderId: z.string() }))
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

      // Calculate the next logical reminder time
      const nextReminderTime = getNextReminderTime();

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
});
