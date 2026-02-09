import { format, isAfter, subYears } from "date-fns";

export default function BookmarkFormattedCreatedAt(prop: { createdAt: Date }) {
  const createdAt = prop.createdAt;
  const oneYearAgo = subYears(new Date(), 1);
  const formatString = isAfter(createdAt, oneYearAgo) ? "MMM d" : "MMM d, yyyy";
  return format(createdAt, formatString);
}
