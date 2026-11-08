import { format, isThisYear } from "date-fns";

// This year's dates go without the year. See useRelativeTime for tooltips.
export default function BookmarkFormattedCreatedAt(prop: { createdAt: Date }) {
  const createdAt = prop.createdAt;
  const formatString = isThisYear(createdAt) ? "MMM d" : "MMM d, yyyy";
  return format(createdAt, formatString);
}
