import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

export default function useRelativeTime(date: Date) {
  const [state, setState] = useState({
    fromNow: "",
    localCreatedAt: "",
  });

  // This is to avoid hydration errors when server and clients are in different timezones
  useEffect(() => {
    setState({
      fromNow: formatDistanceToNow(date, { addSuffix: true }),
      localCreatedAt: date.toLocaleString(),
    });
  }, [date]);

  return state;
}
