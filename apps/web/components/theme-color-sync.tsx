"use client";

import { useEffect } from "react";
import { THEME_COLORS } from "@/lib/themeColors";
import { useTheme } from "next-themes";

/**
 * Keeps the `theme-color` meta tags in sync with the theme the app is actually
 * rendering.
 *
 * The static entries in `viewport.themeColor` use `prefers-color-scheme`, so on
 * their own they follow the operating system rather than an in-app override. A
 * user who selects a theme opposite to their system preference would otherwise
 * get browser chrome that does not match the page.
 *
 * Every `theme-color` tag is set to the resolved color, so whichever media
 * query the browser matches, it reads the same value. The static tags are left
 * in the markup so that the correct color is still applied before hydration and
 * when JavaScript is unavailable.
 */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) {
      return;
    }
    const color =
      resolvedTheme === "dark" ? THEME_COLORS.dark : THEME_COLORS.light;
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((tag) => tag.setAttribute("content", color));
  }, [resolvedTheme]);

  return null;
}
