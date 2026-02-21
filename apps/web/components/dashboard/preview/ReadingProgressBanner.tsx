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
    <div className="sticky top-0 z-10 flex justify-center px-4 py-3">
      <div className="flex items-center gap-3 rounded-full border border-border/60 bg-background/80 px-4 py-2 text-sm shadow-sm backdrop-blur-md">
        <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-muted-foreground">{message}</span>
        <button
          onClick={onContinue}
          className="shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background transition-opacity hover:opacity-80"
        >
          {t("preview.continue_button")}
        </button>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
