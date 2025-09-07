import { Alert, Pressable, View } from "react-native";
import { TailwindResolver } from "@/components/TailwindResolver";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/trpc";
import { MenuView } from "@react-native-menu/menu";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal } from "lucide-react-native";

import type { ZReminder } from "@karakeep/shared/types/reminders";
import { getNextReminderDescription } from "@karakeep/shared/utils/reminderTimeslotsUtils";

interface ReminderBannerProps {
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
        textPrimary: "text-red-700 dark:text-red-300",
        textSecondary: "text-red-600 dark:text-red-400",
      };
    case "upcoming":
      return {
        // Blue theme for scheduled upcoming reminders
        cardBg: "bg-blue-50 dark:bg-blue-950/20",
        cardBorder: "border-blue-200 dark:border-blue-900",
        bannerBg: "bg-blue-100/30 dark:bg-blue-900/30",
        textPrimary: "text-blue-700 dark:text-blue-300",
        textSecondary: "text-blue-600 dark:text-blue-400",
      };
    case "dismissed":
      return {
        // Gray theme for dismissed/completed reminders
        cardBg: "bg-gray-50 dark:bg-gray-950/20",
        cardBorder: "border-gray-200 dark:border-gray-700",
        bannerBg: "bg-gray-100/30 dark:bg-gray-800/30",
        textPrimary: "text-gray-700 dark:text-gray-300",
        textSecondary: "text-gray-600 dark:text-gray-400",
      };
    default:
      // Default fallback
      return {
        cardBg: "bg-gray-50 dark:bg-gray-950/20",
        cardBorder: "border-gray-200 dark:border-gray-700",
        bannerBg: "bg-gray-100/30 dark:bg-gray-800/30",
        textPrimary: "text-gray-700 dark:text-gray-300",
        textSecondary: "text-gray-600 dark:text-gray-400",
      };
  }
}

export default function ReminderBanner({
  reminder,
  reminderType,
}: ReminderBannerProps) {
  const { toast } = useToast();
  const utils = api.useUtils();

  const updateReminderMutation = api.reminders.updateReminder.useMutation({
    onSuccess: () => {
      utils.reminders.invalidate();
      utils.bookmarks.invalidate();
      toast({
        message: "Reminder updated successfully",
        variant: "success",
        showProgress: false,
      });
    },
    onError: (error: unknown) => {
      toast({
        message: `Failed to update reminder: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
        showProgress: false,
      });
    },
  });

  const deleteReminderMutation = api.reminders.deleteReminder.useMutation({
    onSuccess: () => {
      utils.reminders.invalidate();
      utils.bookmarks.invalidate();
      toast({
        message: "Reminder deleted successfully",
        variant: "success",
        showProgress: false,
      });
    },
    onError: (error: unknown) => {
      toast({
        message: `Failed to delete reminder: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
        showProgress: false,
      });
    },
  });

  const snoozeReminderMutation = api.reminders.snoozeReminder.useMutation({
    onSuccess: () => {
      utils.reminders.invalidate();
      utils.bookmarks.invalidate();
      const nextTime = getNextReminderDescription();
      toast({
        message: `Reminder snoozed to ${nextTime}`,
        variant: "success",
        showProgress: false,
      });
    },
    onError: (error: unknown) => {
      toast({
        message: `Failed to snooze reminder: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
        showProgress: false,
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
    Alert.alert(
      "Delete Reminder",
      "Are you sure you want to delete this reminder?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteReminderMutation.mutate({
              reminderId: reminder.id,
            });
          },
        },
      ],
    );
  };

  const timeText = formatDistanceToNow(new Date(reminder.remindAt), {
    addSuffix: true,
  });
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
      default:
        return "📌";
    }
  };

  const menuActions = [
    ...(reminderType === "due" || reminderType === "upcoming"
      ? [
          {
            id: "dismiss",
            title: "Dismiss",
            systemIcon: "xmark",
            action: handleDismiss,
          },
        ]
      : []),
    ...(reminderType === "due"
      ? [
          {
            id: "snooze",
            title: `Snooze to ${getNextReminderDescription()}`,
            systemIcon: "clock",
            action: handleSnooze,
          },
        ]
      : []),
    ...(reminderType === "dismissed"
      ? [
          {
            id: "reactivate",
            title: "Reactivate",
            systemIcon: "arrow.clockwise",
            action: handleReactivate,
          },
        ]
      : []),
    {
      id: "delete",
      title: "Delete reminder",
      systemIcon: "trash",
      destructive: true,
      action: handleDelete,
    },
  ];

  return (
    <View
      className={`flex-row items-center justify-between px-3 py-1.5 ${theme.bannerBg}`}
    >
      <View className="flex-row items-center gap-2">
        <Text className={`text-base ${theme.textPrimary}`}>{getEmoji()}</Text>
        <Text className={`font-medium ${theme.textPrimary}`}>
          {getBannerText()}
        </Text>
        <Text className={theme.textSecondary}>•</Text>
        <Text className={theme.textSecondary}>{getTimeText()}</Text>
      </View>

      {/* Menu button */}
      <MenuView
        actions={menuActions.map((action) => ({
          id: action.id,
          title: action.title,
          ...(action.systemIcon && { systemIcon: action.systemIcon }),
          ...(action.destructive && { attributes: { destructive: true } }),
        }))}
        onPressAction={({ nativeEvent }) => {
          const action = menuActions.find((a) => a.id === nativeEvent.event);
          action?.action();
        }}
      >
        <Pressable className="p-1">
          <TailwindResolver
            className={theme.textSecondary}
            comp={(styles: unknown) => (
              <MoreHorizontal
                size={16}
                color={(styles as { color?: string })?.color?.toString()}
              />
            )}
          />
        </Pressable>
      </MenuView>
    </View>
  );
}
