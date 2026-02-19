"use client";

import { useTranslation } from "@/lib/i18n/client";
import { BookOpen, X } from "lucide-react";

export default function ReadingProgressBanner({
  percent,
  onContinue,
  onDismiss,
}: {
  percent?: number | null;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();

  const message =
    percent && percent > 0
      ? t("preview.continue_reading_percent", { percent })
      : t("preview.continue_reading");

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-accent/50 px-4 py-2 text-sm backdrop-blur">
      <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{message}</span>
      <button
        onClick={onContinue}
        className="shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        {t("preview.continue_button")}
      </button>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
