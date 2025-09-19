import dayjs from "dayjs";

export default function BookmarkFormattedCreatedAt(prop: { createdAt: Date }) {
  const createdAt = dayjs(prop.createdAt);
  const oneYearAgo = dayjs().subtract(1, "year");
  const formatString = createdAt.isAfter(oneYearAgo) ? "MMM D" : "MMM D, YYYY";
  return createdAt.format(formatString);
}
