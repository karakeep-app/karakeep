"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { api } from "@/lib/trpc";
import { Slot } from "@radix-ui/react-slot";
import { format, formatDistanceToNow } from "date-fns";
import { Clock } from "lucide-react";
import { ErrorBoundary } from "react-error-boundary";
import { b } from "vitest/dist/chunks/suite.d.FvehnV49.js";

import type { ZReminder } from "@karakeep/shared/types/reminders";
import { getNextReminderDescription } from "@karakeep/shared/utils/reminderTimeslotsUtils";

import BookmarkCard from "../bookmarks/BookmarkCard";
import BookmarksGrid from "../bookmarks/BookmarksGrid";
import UnknownCard from "../bookmarks/UnknownCard";

function StyledBookmarkCard({ children }: { children: React.ReactNode }) {
  return (
    <Slot className="mb-4 border border-border bg-card duration-300 ease-in hover:shadow-lg hover:transition-all">
      {children}
    </Slot>
  );
}

interface ReminderCardProps {
  reminder: ZReminder;
  reminderType: "due" | "upcoming" | "dismissed";
}

function ReminderMetadata({
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

  return (
    <div className="flex items-center justify-between rounded-t border border-b-0 border-border bg-muted/50 p-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {format(new Date(reminder.remindAt), "PPP 'at' p")}
        </span>
        <span className="text-sm text-muted-foreground">({timeText})</span>
      </div>

      <div className="flex items-center gap-2">
        {(reminderType === "due" || reminderType === "upcoming") && (
          <Button size="sm" variant="outline" onClick={onDismiss}>
            Dismiss
          </Button>
        )}

        {reminderType === "due" && (
          <Button size="sm" variant="outline" onClick={onSnooze}>
            Snooze to {getNextReminderDescription()}
          </Button>
        )}

        {reminderType === "dismissed" && (
          <Button size="sm" variant="outline" onClick={onReactivate}>
            Reactivate
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="text-red-600 hover:text-red-800"
        >
          Delete reminder
        </Button>
      </div>
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
      <Card className="animate-pulse">
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
      <Card className="border-red-200">
        <div className="p-4">
          <p className="mb-4 text-red-600">Bookmark not found or deleted</p>
          <ReminderMetadata
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
      {/* Reminder metadata at the top */}
      <ReminderMetadata
        reminder={reminder}
        reminderType={reminderType}
        onDismiss={handleDismiss}
        onReactivate={handleReactivate}
        onSnooze={handleSnooze}
        onDelete={handleDelete}
      />

      {/* Use BookmarksGrid with a single bookmark - this will apply all the correct styling */}
      <div className="grid grid-cols-1">
        <ErrorBoundary
          key={bookmark.id}
          fallback={<UnknownCard bookmark={bookmark} />}
        >
          <StyledBookmarkCard>
            <BookmarkCard fixedLayout="list" bookmark={bookmark} />
          </StyledBookmarkCard>
        </ErrorBoundary>
      </div>
    </div>
  );
}
