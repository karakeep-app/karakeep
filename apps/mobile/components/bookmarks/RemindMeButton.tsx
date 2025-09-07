import { ActivityIndicator, Pressable } from "react-native";
import { TailwindResolver } from "@/components/TailwindResolver";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/trpc";
import { Clock } from "lucide-react-native";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  getNextReminderDescription,
  getNextReminderTime,
} from "@karakeep/shared/utils/reminderTimeslotsUtils";

interface RemindMeButtonProps {
  bookmark: ZBookmark;
}

export default function RemindMeButton({ bookmark }: RemindMeButtonProps) {
  const { toast } = useToast();
  const utils = api.useUtils();

  const setReminderMutation = api.reminders.setReminder.useMutation({
    onSuccess: () => {
      const nextTime = getNextReminderDescription();
      toast({
        message: `Reminder set for ${nextTime}`,
        variant: "success",
        showProgress: false,
      });
      // Invalidate queries to refresh the UI
      utils.bookmarks.invalidate();
      utils.reminders.invalidate();
    },
    onError: (error) => {
      toast({
        message: `Failed to set reminder: ${error.message}`,
        variant: "destructive",
        showProgress: false,
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
    <Pressable
      onPress={handleRemindMe}
      disabled={setReminderMutation.isPending}
      className="p-2"
      accessibilityLabel={`Remind me ${getNextReminderDescription()}`}
      accessibilityRole="button"
    >
      {setReminderMutation.isPending ? (
        <ActivityIndicator size="small" />
      ) : (
        <TailwindResolver
          className="text-gray-500"
          comp={(styles) => (
            <Clock size={20} color={styles?.color?.toString()} />
          )}
        />
      )}
    </Pressable>
  );
}
