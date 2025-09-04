"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/use-toast";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Clock, MoreHorizontal, RefreshCw, Trash2, X } from "lucide-react";
import { ErrorBoundary } from "react-error-boundary";

import type { ZReminder } from "@karakeep/shared/types/reminders";
import { getNextReminderDescription } from "@karakeep/shared/utils/reminderTimeslotsUtils";

import BookmarkCard from "../bookmarks/BookmarkCard";
import UnknownCard from "../bookmarks/UnknownCard";

interface ReminderCardProps {
  reminder: ZReminder;
  reminderType: "due" | "upcoming" | "dismissed";
}

// Color themes for different reminder states
function getReminderTheme(reminderType: "due" | "upcoming" | "dismissed") {
  switch (reminderType) {
    case "due":
      return {
        // Red theme for urgent due reminders
        cardBg: "bg-red-50 dark:bg-red-950/20",
        cardBorder: "border-red-200 dark:border-red-900",
        bannerBg: "bg-red-100/30 dark:bg-red-900/30",
        dividerBorder: "border-red-200 dark:border-red-900/50",
        textPrimary: "text-red-700 dark:text-red-300",
        textSecondary: "text-red-600 dark:text-red-400",
        buttonHover:
          "text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200",
      };
    case "upcoming":
      return {
        // Blue theme for scheduled upcoming reminders
        cardBg: "bg-blue-50 dark:bg-blue-950/20",
        cardBorder: "border-blue-200 dark:border-blue-900",
        bannerBg: "bg-blue-100/30 dark:bg-blue-900/30",
        dividerBorder: "border-blue-200 dark:border-blue-900/50",
        textPrimary: "text-blue-700 dark:text-blue-300",
        textSecondary: "text-blue-600 dark:text-blue-400",
        buttonHover:
          "text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200",
      };
    case "dismissed":
      return {
        // Gray theme for dismissed/completed reminders
        cardBg: "bg-gray-50 dark:bg-gray-950/20",
        cardBorder: "border-gray-200 dark:border-gray-700",
        bannerBg: "bg-gray-100/30 dark:bg-gray-800/30",
        dividerBorder: "border-gray-200 dark:border-gray-700/50",
        textPrimary: "text-gray-700 dark:text-gray-300",
        textSecondary: "text-gray-600 dark:text-gray-400",
        buttonHover:
          "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200",
      };
  }
}

function ReminderBanner({
  reminder,
  reminderType,
  onDismiss,
  onReactivate,
  onSnooze,
  onDelete,
}: {
  reminder: ZReminder;
  reminderType: "due" | "upcoming" | "dismissed";
  onDismiss: () => void;
  onReactivate: () => void;
  onSnooze: () => void;
  onDelete: () => void;
}) {
  const isPast = new Date(reminder.remindAt) < new Date();
  const timeText = isPast
    ? `${formatDistanceToNow(new Date(reminder.remindAt))} ago`
    : `in ${formatDistanceToNow(new Date(reminder.remindAt))}`;

  const theme = getReminderTheme(reminderType);

  const getBannerText = () => {
    if (reminderType === "dismissed") {
      return "Dismissed reminder";
    }
    if (reminderType === "due") {
      return "Due reminder";
    }
    return "Saved for later";
  };

  const getTimeText = () => {
    if (reminderType === "dismissed") {
      return `Was due ${timeText}`;
    }
    return `Due ${timeText}`;
  };

  const getEmoji = () => {
    switch (reminderType) {
      case "due":
        return "🔥"; // Fire emoji for urgent
      case "upcoming":
        return "📌"; // Pin emoji for upcoming
      case "dismissed":
        return "✅"; // Check mark for completed
    }
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-1.5 text-sm",
        theme.bannerBg,
      )}
    >
      <div className={cn("flex items-center gap-2", theme.textPrimary)}>
        <span className="text-base">{getEmoji()}</span>
        <span className="font-medium">{getBannerText()}</span>
        <span className={theme.textSecondary}>•</span>
        <span className={theme.textSecondary}>{getTimeText()}</span>
      </div>

      {/* Dropdown menu for actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-6 px-2", theme.buttonHover)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(reminderType === "due" || reminderType === "upcoming") && (
            <DropdownMenuItem onClick={onDismiss}>
              <X className="mr-2 h-4 w-4" />
              Dismiss
            </DropdownMenuItem>
          )}
          {reminderType === "due" && (
            <DropdownMenuItem onClick={onSnooze}>
              <Clock className="mr-2 h-4 w-4" />
              Snooze to {getNextReminderDescription()}
            </DropdownMenuItem>
          )}
          {reminderType === "dismissed" && (
            <DropdownMenuItem onClick={onReactivate}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reactivate
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-300"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete reminder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function ReminderCard({
  reminder,
  reminderType,
}: ReminderCardProps) {
  const utils = api.useUtils();

  // Fetch the full bookmark data
  const { data: bookmark, isLoading } = api.bookmarks.getBookmark.useQuery({
    bookmarkId: reminder.bookmarkId,
    includeContent: true,
  });

  const updateReminderMutation = api.reminders.updateReminder.useMutation({
    onSuccess: () => {
      utils.reminders.invalidate();
      utils.bookmarks.invalidate();
      toast({
        description: "Reminder updated successfully",
      });
    },
    onError: (error) => {
      toast({
        description: `Failed to update reminder: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteReminderMutation = api.reminders.deleteReminder.useMutation({
    onSuccess: () => {
      utils.reminders.invalidate();
      utils.bookmarks.invalidate();
      toast({
        description: "Reminder deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        description: `Failed to delete reminder: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const snoozeReminderMutation = api.reminders.snoozeReminder.useMutation({
    onSuccess: () => {
      utils.reminders.invalidate();
      utils.bookmarks.invalidate();
      toast({
        description: "Reminder snoozed successfully",
      });
    },
    onError: (error) => {
      toast({
        description: `Failed to snooze reminder: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleDismiss = () => {
    updateReminderMutation.mutate({
      reminderId: reminder.id,
      status: "dismissed",
    });
  };

  const handleReactivate = () => {
    updateReminderMutation.mutate({
      reminderId: reminder.id,
      status: "active",
    });
  };

  const handleSnooze = () => {
    snoozeReminderMutation.mutate({
      reminderId: reminder.id,
      clientTimestamp: Date.now(),
    });
  };

  const handleDelete = () => {
    deleteReminderMutation.mutate({
      reminderId: reminder.id,
    });
  };

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
    return (
      <Card className={cn("mb-4", theme.cardBorder)}>
        <div className="p-4">
          <p className="mb-4 text-red-600">Bookmark not found or deleted</p>
          <ReminderBanner
            reminder={reminder}
            reminderType={reminderType}
            onDismiss={handleDismiss}
            onReactivate={handleReactivate}
            onSnooze={handleSnooze}
            onDelete={handleDelete}
          />
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
          theme.cardBg,
          theme.cardBorder,
        )}
      >
        <ReminderBanner
          reminder={reminder}
          reminderType={reminderType}
          onDismiss={handleDismiss}
          onReactivate={handleReactivate}
          onSnooze={handleSnooze}
          onDelete={handleDelete}
        />

        <div className={cn("border-t", theme.dividerBorder)} />

        <div>
          <ErrorBoundary
            key={bookmark.id}
            fallback={<UnknownCard bookmark={bookmark} />}
          >
            <BookmarkCard
              fixedLayout="list"
              bookmark={bookmark}
              className="mb-0 border-0 bg-transparent duration-300 ease-in hover:shadow-lg hover:transition-all"
            />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
