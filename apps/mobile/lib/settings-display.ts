import type { Settings } from "@/lib/settings";

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
