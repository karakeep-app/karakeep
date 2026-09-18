import type { Settings } from "@/lib/settings";

import { i18n } from "@/lib/i18n";

/**
 * Translated labels for user-visible settings options.
 *
 * The static `*_LABELS` / `*_OPTIONS` constants below predate i18n and stay
 * exported for compatibility, but they are always English. New code should
 * use the `get*` functions so labels follow the active app language.
 */
export function getThemeLabels(): Record<Settings["theme"], string> {
  return {
    dark: i18n.t("settings.theme_dark"),
    light: i18n.t("settings.theme_light"),
    system: i18n.t("settings.theme_system"),
  };
}

export function getBookmarkViewLabels(): Record<
  Settings["defaultBookmarkView"],
  string
> {
  return {
    browser: i18n.t("settings.open_in_browser"),
    externalBrowser: i18n.t("settings.open_in_external"),
    reader: i18n.t("settings.open_in_reader"),
  };
}

export interface UploadQualityOption {
  readonly description: string;
  readonly label: string;
  readonly value: number;
}

export function getUploadQualityOptions(): UploadQualityOption[] {
  return [
    {
      description: i18n.t("settings.uploads_data_saver_hint"),
      label: i18n.t("settings.uploads_data_saver"),
      value: 0.2,
    },
    {
      description: i18n.t("settings.uploads_standard_hint"),
      label: i18n.t("settings.uploads_standard"),
      value: 0.6,
    },
    {
      description: i18n.t("settings.uploads_original_hint"),
      label: i18n.t("settings.uploads_original"),
      value: 1,
    },
  ];
}

export function getTranslatedUploadQualityLabel(value: number) {
  return getUploadQualityOptions().reduce((closest, option) =>
    Math.abs(option.value - value) < Math.abs(closest.value - value)
      ? option
      : closest,
  ).label;
}

const THEME_LABELS: Record<Settings["theme"], string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

const BOOKMARK_VIEW_LABELS: Record<Settings["defaultBookmarkView"], string> = {
  browser: "Browser",
  externalBrowser: "External Browser",
  reader: "Reader",
};

const UPLOAD_QUALITY_OPTIONS = [
  {
    description: "Smaller files and faster uploads",
    label: "Data Saver",
    value: 0.2,
  },
  {
    description: "A balance of detail and file size",
    label: "Standard",
    value: 0.6,
  },
  {
    description: "Keep the most image detail",
    label: "Original",
    value: 1,
  },
] as const;

function getUploadQualityLabel(value: number) {
  return UPLOAD_QUALITY_OPTIONS.reduce((closest, option) =>
    Math.abs(option.value - value) < Math.abs(closest.value - value)
      ? option
      : closest,
  ).label;
}

export {
  BOOKMARK_VIEW_LABELS,
  getUploadQualityLabel,
  THEME_LABELS,
  UPLOAD_QUALITY_OPTIONS,
};
