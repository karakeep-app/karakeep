import { useEffect, useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export default function useRelativeTime(date: Date) {
  const [state, setState] = useState({
    fromNow: "",
    localCreatedAt: "",
  });

  // This is to avoid hydration errors when server and clients are in different timezones
  useEffect(() => {
    setState({
      fromNow: dayjs(date).fromNow(),
      localCreatedAt: date.toLocaleString(),
    });
  }, [date]);

  return state;
}
