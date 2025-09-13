/**
 * Utility functions for calculating reminder time slots
 *
 * Standard time slots: 9am (morning), 1pm (afternoon), 8pm (evening)
 * Future: These will be customizable in user settings
 */

export const DEFAULT_TIME_SLOTS = {
  morning: 9, // 9am
  afternoon: 13, // 1pm
  evening: 20, // 8pm
} as const;

export type TimeSlot = keyof typeof DEFAULT_TIME_SLOTS;

/**
 * Calculate the next logical reminder time based on current time
 * Logic:
 * - Before 9am: Next slot is 9am today
 * - 9am-12:59pm: Next slot is 1pm today
 * - 1pm-7:59pm: Next slot is 8pm today
 * - After 8pm: Next slot is 9am tomorrow
 */
export function getNextReminderTime(currentTime: Date = new Date()): Date {
  const now = new Date(currentTime);
  const currentHour = now.getHours();

  // Create a new date for the reminder time
  const reminderTime = new Date(now);
  reminderTime.setMinutes(0);
  reminderTime.setSeconds(0);
  reminderTime.setMilliseconds(0);

  if (currentHour < DEFAULT_TIME_SLOTS.morning) {
    // Before 9am: set to 9am today
    reminderTime.setHours(DEFAULT_TIME_SLOTS.morning);
  } else if (currentHour < DEFAULT_TIME_SLOTS.afternoon) {
    // 9am-12:59pm: set to 1pm today
    reminderTime.setHours(DEFAULT_TIME_SLOTS.afternoon);
  } else if (currentHour < DEFAULT_TIME_SLOTS.evening) {
    // 1pm-7:59pm: set to 8pm today
    reminderTime.setHours(DEFAULT_TIME_SLOTS.evening);
  } else {
    // After 8pm: set to 9am tomorrow
    reminderTime.setDate(reminderTime.getDate() + 1);
    reminderTime.setHours(DEFAULT_TIME_SLOTS.morning);
  }

  return reminderTime;
}

/**
 * Get a human-readable description of when the next reminder will be
 */
export function getNextReminderDescription(
  currentTime: Date = new Date(),
): string {
  const now = new Date(currentTime);
  const nextTime = getNextReminderTime(currentTime);
  const currentHour = now.getHours();

  const isToday = now.toDateString() === nextTime.toDateString();
  const timePrefix = isToday ? "today" : "tomorrow";

  if (currentHour < DEFAULT_TIME_SLOTS.morning) {
    return `${timePrefix} morning`;
  } else if (currentHour < DEFAULT_TIME_SLOTS.afternoon) {
    return `${timePrefix} afternoon`;
  } else if (currentHour < DEFAULT_TIME_SLOTS.evening) {
    return `${timePrefix} evening`;
  } else {
    return "tomorrow morning";
  }
}
