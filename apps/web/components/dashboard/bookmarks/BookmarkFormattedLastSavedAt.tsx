import { format, isAfter, subYears } from "date-fns";

export default function BookmarkFormattedLastSavedAt({
  lastSavedAt,
}: {
  lastSavedAt: Date;
}) {
  const oneYearAgo = subYears(new Date(), 1);
  const formatString = isAfter(lastSavedAt, oneYearAgo)
    ? "MMM d"
    : "MMM d, yyyy";
  return format(lastSavedAt, formatString);
}
