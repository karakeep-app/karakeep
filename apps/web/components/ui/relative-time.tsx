"use client";

import useRelativeTime from "@/lib/hooks/relative-time";
import { useTranslation } from "@/lib/i18n/client";

export default function RelativeTime({ date }: { date: Date }) {
  const { i18n } = useTranslation();
  const { fromNow, localCreatedAt } = useRelativeTime(date, i18n.language);

  return (
    <time dateTime={date.toISOString()} title={localCreatedAt || undefined}>
      {fromNow || "—"}
    </time>
  );
}
