"use client";

import type { ThemeProviderProps } from "next-themes";
import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider scriptProps={{ "data-cfasync": "false" }} {...props}>
      {children}
    </NextThemesProvider>
  );
}

export function useToggleTheme() {
  const { theme, setTheme } = useTheme();
  // cycle
  // system -> light, light -> dark, dark -> system again
  if (theme == "system") {
    return () => setTheme("light");
  } else if (theme == "light") {
    return () => setTheme("dark");
  } else {
    return () => setTheme("system");
  }
}
