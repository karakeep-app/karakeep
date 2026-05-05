import { useRef } from "react";
import { useHeaderHeight } from "@react-navigation/elements";

// `useHeaderHeight()` returns 0 while the header is hidden, which would
// collapse any layout that depends on it and cause content to jump. Latch
// the last non-zero value so consumers see a stable height across show/hide
// cycles.
export function useStableHeaderHeight(): number {
  const measured = useHeaderHeight();
  const lastSeen = useRef(measured);
  if (measured > 0) {
    lastSeen.current = measured;
  }
  return lastSeen.current;
}
