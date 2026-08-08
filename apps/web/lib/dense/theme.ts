"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The three theme axes the prototype (`design/Karakeep Dark.dc.html`)
 * exposes as a `dc-script` control panel — accent colour, surface tone, and
 * reading emphasis — made real as a user-facing picker. Values transcribed
 * from `design/README.md`'s design-tokens tables; nothing here is invented.
 *
 * Each preset is a full set of CSS custom-property values. A chosen
 * combination is applied by writing those properties as inline styles on
 * `<html>`, the same mechanism `--k-zoom` already uses (see
 * DenseScaleController) — inline styles override `dense-theme.css`'s
 * class-based defaults by origin, so the CSS file's own values stay the
 * literal defaults (violet / Deep slate / Title-led) with no JS required to
 * see them; the hook only needs to write the properties that changed.
 */

export type Accent = "mint" | "violet" | "amber" | "blue";
export type SurfaceTone = "charcoal" | "true-black" | "deep-slate";
export type ReadingEmphasis = "title-led" | "balanced" | "summary-led";

export const ACCENTS: {
  id: Accent;
  label: string;
  hex: string;
  hsl: string;
}[] = [
  { id: "mint", label: "Mint", hex: "#7ee2b8", hsl: "154.8 63.3% 69.0%" },
  { id: "violet", label: "Violet", hex: "#7c5dff", hsl: "251.5 100% 68.2%" },
  { id: "amber", label: "Amber", hex: "#e8b14c", hsl: "38.8 77.2% 60.4%" },
  { id: "blue", label: "Blue", hex: "#8ab4f8", hsl: "217.1 88.7% 75.7%" },
];

interface TonePreset {
  id: SurfaceTone;
  label: string;
  bg: string;
  surface1: string;
  surface2: string;
  border: string;
  borderSoft: string;
  /** HSL triples of the five colours above, for the shadcn variable remap
   *  (which composes them as `hsl(var(--x))`, so it needs bare triples). */
  bgHsl: string;
  surface1Hsl: string;
  surface2Hsl: string;
  borderHsl: string;
}

export const SURFACE_TONES: TonePreset[] = [
  {
    id: "charcoal",
    label: "Charcoal",
    bg: "#0d0d0e",
    surface1: "#141516",
    surface2: "#111112",
    border: "#232427",
    borderSoft: "#1a1b1d",
    bgHsl: "240 3.7% 5.3%",
    surface1Hsl: "210 4.8% 8.2%",
    surface2Hsl: "240 2.9% 6.9%",
    borderHsl: "225 5.4% 14.5%",
  },
  {
    id: "true-black",
    label: "True black",
    bg: "#000000",
    surface1: "#0b0b0c",
    surface2: "#070708",
    border: "#1c1c1e",
    borderSoft: "#141415",
    bgHsl: "0 0% 0%",
    surface1Hsl: "240 4.3% 4.5%",
    surface2Hsl: "240 6.7% 2.9%",
    borderHsl: "240 3.4% 11.4%",
  },
  {
    id: "deep-slate",
    label: "Deep slate",
    bg: "#0e1116",
    surface1: "#151a21",
    surface2: "#11151c",
    border: "#232b36",
    borderSoft: "#191f27",
    bgHsl: "217.5 22.2% 7.1%",
    surface1Hsl: "215 22.2% 10.6%",
    surface2Hsl: "218.2 24.4% 8.8%",
    borderHsl: "214.7 21.3% 17.5%",
  },
];

interface EmphasisPreset {
  id: ReadingEmphasis;
  label: string;
  /** Row/list summary. */
  summarySize: string;
  /** Shared across all three summary contexts below — the design doc's
   *  table has a single "line-height" row, not one per context. */
  summaryLineHeight: string;
  /** Detail read-out summary. */
  detailSummarySize: string;
  /** Grid card summary ("index summary" in the doc's table). */
  cardSummarySize: string;
  summaryColor: string;
  summaryStrongColor: string;
  rowTitleWeight: string;
  cardTitleWeight: string;
  cardTitleSize: string;
}

export const READING_EMPHASES: EmphasisPreset[] = [
  {
    id: "title-led",
    label: "Title-led",
    summarySize: "12px",
    summaryLineHeight: "1.5",
    detailSummarySize: "13px",
    cardSummarySize: "11px",
    summaryColor: "#87847f",
    summaryStrongColor: "#a9a6a1",
    rowTitleWeight: "600",
    cardTitleWeight: "650",
    cardTitleSize: "17px",
  },
  {
    id: "balanced",
    label: "Balanced",
    summarySize: "12.5px",
    summaryLineHeight: "1.6",
    detailSummarySize: "14px",
    cardSummarySize: "11.5px",
    summaryColor: "#a9a6a1",
    summaryStrongColor: "#c2bfba",
    rowTitleWeight: "550",
    cardTitleWeight: "600",
    cardTitleSize: "16px",
  },
  {
    id: "summary-led",
    label: "Summary-led",
    summarySize: "13.5px",
    summaryLineHeight: "1.72",
    detailSummarySize: "15.5px",
    cardSummarySize: "12.5px",
    summaryColor: "#c2bfba",
    summaryStrongColor: "#ddd9d4",
    rowTitleWeight: "500",
    cardTitleWeight: "550",
    cardTitleSize: "14.5px",
  },
];

/**
 * List "dots" (sidebar) and similar small categorical swatches need a few
 * distinct colours, not just the one active accent. Rather than a second,
 * separately-maintained palette, these are drawn from the same four
 * accents the theme picker itself offers — the active one first, then the
 * next two in ACCENTS order (wrapping around it) — so a list's dot always
 * includes the current accent and the set updates when the theme does,
 * without introducing any colour the design doc didn't already define.
 */
export function topicColorsFor(accent: Accent): string[] {
  const activeIndex = ACCENTS.findIndex((a) => a.id === accent);
  return [0, 1, 2].map(
    (offset) => ACCENTS[(activeIndex + offset) % ACCENTS.length].hex,
  );
}

export const DEFAULT_ACCENT: Accent = "violet";
export const DEFAULT_TONE: SurfaceTone = "deep-slate";
export const DEFAULT_EMPHASIS: ReadingEmphasis = "title-led";

const STORAGE_KEY = "k-dense-theme";

export interface DenseThemePreference {
  accent: Accent;
  tone: SurfaceTone;
  emphasis: ReadingEmphasis;
}

const DEFAULT_PREFERENCE: DenseThemePreference = {
  accent: DEFAULT_ACCENT,
  tone: DEFAULT_TONE,
  emphasis: DEFAULT_EMPHASIS,
};

function parsePreference(stored: string | null): DenseThemePreference {
  if (!stored) return DEFAULT_PREFERENCE;
  try {
    const parsed = JSON.parse(stored) as Partial<DenseThemePreference>;
    return {
      accent: ACCENTS.some((a) => a.id === parsed.accent)
        ? (parsed.accent as Accent)
        : DEFAULT_ACCENT,
      tone: SURFACE_TONES.some((t) => t.id === parsed.tone)
        ? (parsed.tone as SurfaceTone)
        : DEFAULT_TONE,
      emphasis: READING_EMPHASES.some((e) => e.id === parsed.emphasis)
        ? (parsed.emphasis as ReadingEmphasis)
        : DEFAULT_EMPHASIS,
    };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

/** Every `--k-*` / shadcn-remap custom property a given preference combo
 *  needs to override on `<html>`. Variables that don't change across any
 *  preset (fg/fg-soft/fg-muted/fg-dim/icon/timestamp/...) are left alone —
 *  they stay whatever dense-theme.css's static defaults already say. */
function cssVarsFor(pref: DenseThemePreference): Record<string, string> {
  const accent = ACCENTS.find((a) => a.id === pref.accent)!;
  const tone = SURFACE_TONES.find((t) => t.id === pref.tone)!;
  const emph = READING_EMPHASES.find((e) => e.id === pref.emphasis)!;

  return {
    "--k-accent": accent.hex,
    "--k-bg": tone.bg,
    "--k-surface-1": tone.surface1,
    "--k-surface-2": tone.surface2,
    "--k-border": tone.border,
    "--k-border-soft": tone.borderSoft,
    "--k-summary": emph.summaryColor,
    "--k-summary-strong": emph.summaryStrongColor,
    "--k-row-summary-size": emph.summarySize,
    "--k-summary-lh": emph.summaryLineHeight,
    "--k-detail-summary-size": emph.detailSummarySize,
    "--k-card-summary-size": emph.cardSummarySize,
    "--k-row-title-weight": emph.rowTitleWeight,
    "--k-card-title-weight": emph.cardTitleWeight,
    "--k-card-title-size": emph.cardTitleSize,
    // shadcn remap (see dense-theme.css's own comment on why this exists)
    "--background": tone.bgHsl,
    "--card": tone.surface1Hsl,
    "--popover": tone.surface1Hsl,
    "--secondary": tone.surface1Hsl,
    "--muted": tone.surface2Hsl,
    "--accent": tone.borderHsl,
    "--border": tone.borderHsl,
    "--input": tone.borderHsl,
    "--ring": accent.hsl,
  };
}

export function useDenseTheme() {
  const [preference, setPreferenceState] =
    useState<DenseThemePreference>(DEFAULT_PREFERENCE);

  useEffect(() => {
    setPreferenceState(
      parsePreference(window.localStorage.getItem(STORAGE_KEY)),
    );
  }, []);

  useEffect(() => {
    // Two targets, not one. `<html>` is what ForceDenseTheme mirrors
    // `.k-dense` onto for portaled content (dropdowns/dialogs render into
    // `<body>`, outside the wrapper below) — an override written only
    // there is exactly what those portals see, and nothing else, because
    // the wrapper *itself* also carries a literal `.k-dense` class
    // (dashboard/layout.tsx), whose static declarations in dense-theme.css
    // match it directly. For any of the wrapper's own descendants — i.e.
    // the entire dashboard — that direct match wins over whatever they'd
    // otherwise inherit from html, the same way an element's own CSS
    // always beats an ancestor's. So the wrapper needs the same inline
    // overrides written onto it directly, or none of the main content
    // (only portals) would ever see a chosen theme.
    const html = document.documentElement;
    const wrapper = document.querySelector<HTMLElement>(".k-dense-zoom");
    const targets = [html, wrapper].filter(
      (el): el is HTMLElement => el !== null,
    );
    const vars = cssVarsFor(preference);
    for (const target of targets) {
      for (const [prop, value] of Object.entries(vars)) {
        target.style.setProperty(prop, value);
      }
    }
    return () => {
      for (const target of targets) {
        for (const prop of Object.keys(vars)) {
          target.style.removeProperty(prop);
        }
      }
    };
  }, [preference]);

  const setPreference = useCallback((next: Partial<DenseThemePreference>) => {
    setPreferenceState((prev) => {
      const merged = { ...prev, ...next };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    });
  }, []);

  return { preference, setPreference };
}
