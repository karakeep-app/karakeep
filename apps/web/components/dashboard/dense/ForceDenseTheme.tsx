"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

/**
 * The dense fork is dark-only. Two things need forcing for as long as a
 * dashboard page is mounted:
 *
 * 1. next-themes owns the `dark`/`light` class on <html> and actively
 *    re-syncs it (e.g. on system theme changes), so toggling that class by
 *    hand would just get raced/overwritten. Going through `setTheme("dark")`
 *    makes next-themes itself the one applying the class, and we restore
 *    whatever the user had on unmount so leaving the dashboard (settings,
 *    admin, ...) doesn't silently flip their preference.
 * 2. Radix portals (dropdowns/dialogs/popovers) render as a child of
 *    `document.body`, outside the `.k-dense` wrapper div in the React tree,
 *    so they don't inherit its --k-* tokens or font CSS variables through
 *    the DOM either. Mirroring those classes onto <html> fixes that, since
 *    portaled content is still a descendant of <html>.
 */
export function ForceDenseTheme({
  fontClassNames,
}: {
  fontClassNames: string;
}) {
  const { theme, setTheme } = useTheme();
  const previousTheme = useRef<string | undefined>(undefined);
  const hasCapturedPreviousTheme = useRef(false);

  if (!hasCapturedPreviousTheme.current) {
    previousTheme.current = theme;
    hasCapturedPreviousTheme.current = true;
  }

  useEffect(() => {
    setTheme("dark");
    return () => {
      // `theme` can still be `undefined` on the very first client render
      // (next-themes hasn't read localStorage/system preference yet) —
      // fall back to "system" (the app's own default) rather than leaving
      // "dark" stuck for the rest of the session.
      setTheme(previousTheme.current ?? "system");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const classesToAdd = [
      "k-dense",
      ...fontClassNames.split(" ").filter(Boolean),
    ];
    const added = classesToAdd.filter((c) => !html.classList.contains(c));
    html.classList.add(...added);
    return () => {
      html.classList.remove(...added);
    };
  }, [fontClassNames]);

  return null;
}
