import { useEffect, useState } from "react";
import { formatLocalDate } from "@/lib/date-format";
import { formatDistanceToNow } from "date-fns";

export default function useRelativeTime(date: Date, language?: string) {
  const [state, setState] = useState({
    fromNow: "",
    localCreatedAt: "",
  });

  // This is to avoid hydration errors when server and clients are in different timezones
  useEffect(() => {
    setState({
      fromNow: formatDistanceToNow(date, { addSuffix: true }),
      localCreatedAt: formatLocalDate(date, "PP, p", language),
    });
  }, [date, language]);

  return state;
}
