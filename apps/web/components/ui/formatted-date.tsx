"use client";

import { useEffect, useState } from "react";
import { formatLocalDate } from "@/lib/date-format";
import { useTranslation } from "@/lib/i18n/client";

/**
 * Renders a date formatted on the client side to ensure the user's local
 * timezone is used.  Returns an empty string during SSR so that we never
 * render a server-timezone date and avoids hydration mismatches.
 *
 * The default `formatStr` produces output like "Jan 5, 2025, 3:42 PM".
 */
export default function FormattedDate({
  date,
  formatStr = "PP, p",
}: {
  date: Date | null | undefined;
  formatStr?: string;
}) {
  const { i18n } = useTranslation();
  const [formatted, setFormatted] = useState("");

  useEffect(() => {
    setFormatted(date ? formatLocalDate(date, formatStr, i18n.language) : "");
  }, [date, formatStr, i18n.language]);

  return <>{formatted}</>;
}
