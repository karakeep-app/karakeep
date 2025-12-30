import { z } from "zod";

import { ZReaderFontFamily, zReaderFontFamilySchema } from "./users";

export const READER_DEFAULTS = {
  fontSize: 18,
  lineHeight: 1.6,
  fontFamily: "serif" as const,
} as const;

export const READER_FONT_FAMILIES: Record<ZReaderFontFamily, string> = {
  serif: "ui-serif, Georgia, Cambria, serif",
  sans: "ui-sans-serif, system-ui, sans-serif",
  mono: "ui-monospace, Menlo, Monaco, monospace",
} as const;

// Setting constraints for UI controls
export const READER_SETTING_CONSTRAINTS = {
  fontSize: { min: 12, max: 24, step: 1 },
  lineHeight: { min: 1.2, max: 2.5, step: 0.1 },
} as const;

// Formatting functions for display
export function formatFontSize(value: number): string {
  return `${value}px`;
}

export function formatLineHeight(value: number): string {
  return value.toFixed(1);
}

export function formatFontFamily(
  value: ZReaderFontFamily,
  t?: (key: string) => string,
): string {
  if (t) {
    return t(`settings.info.reader_settings.${value}`);
  }
  // Fallback labels when no translation function provided
  switch (value) {
    case "serif":
      return "Serif";
    case "sans":
      return "Sans Serif";
    case "mono":
      return "Monospace";
  }
}

export const zReaderSettings = z.object({
  fontSize: z.number().int().min(12).max(24),
  lineHeight: z.number().min(1.2).max(2.5),
  fontFamily: zReaderFontFamilySchema,
});

export type ReaderSettings = z.infer<typeof zReaderSettings>;

export const zReaderSettingsPartial = zReaderSettings.partial();
export type ReaderSettingsPartial = z.infer<typeof zReaderSettingsPartial>;
