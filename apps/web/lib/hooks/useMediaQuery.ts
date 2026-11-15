import { useCallback, useSyncExternalStore } from "react";

/**
 * Tracks a CSS media query. It's false on the server and during hydration, so
 * only use it for details that can settle after the first paint; use CSS
 * variants for anything that would shift the layout.
 */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
