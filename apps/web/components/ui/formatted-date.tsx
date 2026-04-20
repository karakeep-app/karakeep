"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

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
  const [formatted, setFormatted] = useState("");

  useEffect(() => {
    if (date) {
      setFormatted(format(date, formatStr));
    }
  }, [date, formatStr]);

  return <>{formatted}</>;
}
