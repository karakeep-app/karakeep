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

export const zReaderSettings = z.object({
  fontSize: z.number().int().min(12).max(24),
  lineHeight: z.number().min(1.2).max(2.5),
  fontFamily: zReaderFontFamilySchema,
});

export type ReaderSettings = z.infer<typeof zReaderSettings>;

export const zReaderSettingsPartial = zReaderSettings.partial();
export type ReaderSettingsPartial = z.infer<typeof zReaderSettingsPartial>;
