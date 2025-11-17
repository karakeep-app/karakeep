"use client";

import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";
import { ErrorBoundary } from "react-error-boundary";

import type {
  ZGetRemindersRequest,
  ZReminder,
} from "@karakeep/shared/types/reminders";
import { getReminderTheme } from "@karakeep/shared/utils/reminderThemeUtils";

import BookmarkCard from "../bookmarks/BookmarkCard";
import UnknownCard from "../bookmarks/UnknownCard";

interface ReminderBookmarkCardProps {
  reminder: ZReminder;
  reminderType: NonNullable<ZGetRemindersRequest["reminderType"]>;
}

function ReminderBookmarkCard({
  reminder,
  reminderType,
}: ReminderBookmarkCardProps) {
  // Fetch the full bookmark data
  const { data: bookmark, isLoading } = api.bookmarks.getBookmark.useQuery({
    bookmarkId: reminder.bookmarkId,
    includeContent: true,
  });

  if (isLoading) {
    return (
      <Card className="mb-4 animate-pulse">
        <div className="p-4">
          <div className="mb-2 h-20 rounded bg-muted"></div>
          <div className="mb-2 h-4 w-3/4 rounded bg-muted"></div>
          <div className="h-3 w-1/2 rounded bg-muted"></div>
        </div>
      </Card>
    );
  }

  if (!bookmark) {
    const theme = getReminderTheme(reminderType);
    if (!theme) {
      return (
        <Card className="mb-4">
          <div className="p-4">
            <p className="mb-4 text-red-600">Bookmark not found or deleted</p>
          </div>
        </Card>
      );
    }
    return (
      <Card className={cn("mb-4", theme.cardBorder)}>
        <div className="p-4">
          <p className="mb-4 text-red-600">Bookmark not found or deleted</p>
        </div>
      </Card>
    );
  }

  const theme = getReminderTheme(reminderType);

  return (
    <div className="mb-4">
      <div
        className={cn(
          "overflow-hidden rounded-lg border",
          theme?.cardBg,
          theme?.cardBorder,
        )}
      >
        <div className="flex">
          <ErrorBoundary
            key={bookmark.id}
            fallback={<UnknownCard bookmark={bookmark} />}
          >
            <BookmarkCard
              fixedLayout="list"
              bookmark={bookmark}
              includeContent
              className="mb-0 w-full border-0 bg-transparent duration-300 ease-in hover:shadow-lg hover:transition-all"
            />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

interface RemindersListProps {
  reminderType: NonNullable<ZGetRemindersRequest["reminderType"]>;
  reminders: ZReminder[];
  isLoading: boolean;
}

export default function RemindersList({
  reminderType,
  reminders,
  isLoading,
}: RemindersListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="mb-2 h-20 rounded bg-muted"></div>
              <div className="mb-2 h-4 w-3/4 rounded bg-muted"></div>
              <div className="h-3 w-1/2 rounded bg-muted"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (reminders.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Clock className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-medium">
            No {reminderType} reminders
          </h3>
          <p className="text-muted-foreground">
            {reminderType === "due" &&
              "You're all caught up! No overdue reminders."}
            {reminderType === "upcoming" && "No upcoming reminders scheduled."}
            {reminderType === "dismissed" && "No dismissed reminders yet."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {reminders.map((reminder) => (
        <ReminderBookmarkCard
          key={reminder.id}
          reminder={reminder}
          reminderType={reminderType}
        />
      ))}
    </div>
  );
}
