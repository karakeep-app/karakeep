// Color themes for different reminder states
export function getReminderTheme(
  reminderType: "due" | "upcoming" | "dismissed" | null,
) {
  if (!reminderType) {
    return null;
  }
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

export function getReminderEmoji(
  reminderType: "due" | "upcoming" | "dismissed" | null,
) {
  if (!reminderType) {
    return "";
  }
  switch (reminderType) {
    case "due":
      return "🔥"; // Fire emoji for urgent
    case "upcoming":
      return "📌"; // Pin emoji for upcoming
    case "dismissed":
      return "✅"; // Check mark for completed
  }
}

export function getReminderType(
  reminder:
    | { remindAt: Date; status: "active" | "dismissed" }
    | null
    | undefined,
  clientTimestamp?: number,
): "due" | "upcoming" | "dismissed" | null {
  if (!reminder) {
    return null;
  }

  if (reminder.status === "dismissed") {
    return "dismissed";
  }

  const now = new Date(clientTimestamp ?? Date.now());
  const remindAt = new Date(reminder.remindAt);

  return remindAt <= now ? "due" : "upcoming";
}
