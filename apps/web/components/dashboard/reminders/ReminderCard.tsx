"use client";

import React from "react";
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

function SlackStyleReminderBanner({
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

  const getBannerText = () => {
    if (reminderType === "dismissed") {
      return "Dismissed reminder";
    }
    return "Saved for later";
  };

  const getTimeText = () => {
    if (reminderType === "dismissed") {
      return `Was due ${timeText}`;
    }
    return `Due ${timeText}`;
  };

  return (
    <div className="flex items-center justify-between bg-blue-50/50 px-3 py-1.5 text-sm dark:bg-blue-950/10">
      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
        <span className="text-base">📌</span>
        <span className="font-medium">{getBannerText()}</span>
        <span className="text-blue-600 dark:text-blue-400">•</span>
        <span className="text-blue-600 dark:text-blue-400">
          {getTimeText()}
        </span>
      </div>

      {/* Dropdown menu for actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
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
    return (
      <Card className="mb-4 border-red-200">
        <div className="p-4">
          <p className="mb-4 text-red-600">Bookmark not found or deleted</p>
          <SlackStyleReminderBanner
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

  return (
    <div className="mb-4">
      {/* Wrapper with Slack-style light blue background */}
      <div
        className={cn(
          "overflow-hidden rounded-lg border",
          "bg-blue-50 dark:bg-blue-950/20",
          "border-blue-200 dark:border-blue-900",
        )}
      >
        {/* Slack-style inline reminder banner */}
        <SlackStyleReminderBanner
          reminder={reminder}
          reminderType={reminderType}
          onDismiss={handleDismiss}
          onReactivate={handleReactivate}
          onSnooze={handleSnooze}
          onDelete={handleDelete}
        />

        {/* Subtle divider */}
        <div className="border-t border-blue-200 dark:border-blue-900/50" />

        {/* The bookmark card with subtle background overlay */}
        <div className="bg-white/70 dark:bg-gray-900/50">
          <ErrorBoundary
            key={bookmark.id}
            fallback={<UnknownCard bookmark={bookmark} />}
          >
            <BookmarkCard
              fixedLayout="list"
              bookmark={bookmark}
              className="mb-0 border-0 duration-300 ease-in hover:shadow-lg hover:transition-all"
            />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
