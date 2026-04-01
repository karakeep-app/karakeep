"use client";

import useRelativeTime from "@/lib/hooks/relative-time";

export default function RelativeTime({ date }: { date: Date }) {
  const { fromNow, localCreatedAt } = useRelativeTime(date);
  return <span title={localCreatedAt}>{fromNow}</span>;
}
