"use client";

import { createContext, useContext } from "react";
import { DenseThemePreference, useDenseTheme } from "@/lib/dense/theme";

interface DenseThemeValue {
  preference: DenseThemePreference;
  setPreference: (next: Partial<DenseThemePreference>) => void;
}

const DenseThemeCtx = createContext<DenseThemeValue | null>(null);

export function useDenseThemeContext() {
  const ctx = useContext(DenseThemeCtx);
  if (!ctx) {
    throw new Error(
      "useDenseThemeContext must be used inside DenseThemeProvider",
    );
  }
  return ctx;
}

/** Applies the chosen accent/tone/emphasis as `--k-*` overrides on <html>
 *  (see lib/dense/theme.ts) and publishes the current choice + setter to
 *  the picker UI in DenseFilesView's header menu. */
export function DenseThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { preference, setPreference } = useDenseTheme();

  return (
    <DenseThemeCtx.Provider value={{ preference, setPreference }}>
      {children}
    </DenseThemeCtx.Provider>
  );
}
