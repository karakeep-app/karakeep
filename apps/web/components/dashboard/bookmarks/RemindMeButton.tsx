"use client";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { api } from "@/lib/trpc";
import { Clock } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  getNextReminderDescription,
  getNextReminderTime,
} from "@karakeep/shared/utils/reminderTimeslotsUtils";

export default function RemindMeButton({ bookmark }: { bookmark: ZBookmark }) {
  const utils = api.useUtils();

  const setReminderMutation = api.reminders.setReminder.useMutation({
    onSuccess: () => {
      const nextTime = getNextReminderDescription();
      toast({
        description: `Reminder set for ${nextTime}`,
      });
      // Invalidate queries to refresh the UI
      utils.bookmarks.invalidate();
      utils.reminders.invalidate();
    },
    onError: (error) => {
      toast({
        description: `Failed to set reminder: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleRemindMe = () => {
    // Set reminder for the next logical time slot
    const reminderTime = getNextReminderTime();

    setReminderMutation.mutate({
      bookmarkId: bookmark.id,
      remindAt: reminderTime,
    });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="px-2 text-gray-500 hover:text-gray-700"
      onClick={handleRemindMe}
      disabled={setReminderMutation.isPending}
      title={`Remind me ${getNextReminderDescription()}`}
    >
      <Clock size={16} />
    </Button>
  );
}
