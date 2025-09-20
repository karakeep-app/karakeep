import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  getReminderEmoji,
  getReminderTheme,
  getReminderType,
} from "@karakeep/shared/utils/reminderThemeUtils";

interface ReminderBannerProps {
  bookmark?: ZBookmark;
  compact?: boolean;
  clientTimestamp?: number;
}

export default function ReminderBanner({
  bookmark,
  compact,
  clientTimestamp,
}: ReminderBannerProps) {
  const reminder = bookmark?.reminder;

  if (!reminder || reminder.status === "dismissed") {
    return null;
  }

  const reminderType = getReminderType(reminder, clientTimestamp);
  const theme = getReminderTheme(reminderType);

  // If no theme (shouldn't happen with valid reminder), don't render
  if (!theme) {
    return null;
  }

  const isPast =
    new Date(reminder.remindAt) < new Date(clientTimestamp ?? Date.now());
  const timeText = isPast
    ? `${formatDistanceToNow(new Date(reminder.remindAt))} ago`
    : `in ${formatDistanceToNow(new Date(reminder.remindAt))}`;

  const getTimeText = () => {
    if (reminderType === "dismissed") {
      return `Was due ${timeText}`;
    }
    return `Due ${timeText}`;
  };

  const emoji = getReminderEmoji(reminderType);

  return (
    <div
      className={cn(
        "flex items-center justify-between text-sm",
        theme.bannerBg,
        compact ? "rounded-t-lg px-2 py-1" : "px-3 py-1.5",
      )}
    >
      <div className={cn("flex items-center gap-2", theme.textPrimary)}>
        <span className="text-base">{emoji}</span>
        <span className={theme.textSecondary}>{getTimeText()}</span>
      </div>
    </div>
  );
}
