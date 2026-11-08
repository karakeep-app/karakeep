"use client";

import { useTranslation } from "@/lib/i18n/client";
import { BookOpen, X } from "lucide-react";

import { IconTooltip } from "./IconControl";

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
    <div className="sticky top-0 z-10 flex justify-center py-3 font-sans sm:px-4">
      <div className="flex min-w-0 items-center gap-2 rounded-full border border-border/60 bg-background/80 py-1 pl-4 pr-1 text-sm shadow-sm backdrop-blur-md">
        <BookOpen className="size-4 shrink-0 text-muted-foreground max-sm:hidden" />
        <span className="text-muted-foreground sm:truncate">{message}</span>
        <button
          onClick={onContinue}
          className="h-8 shrink-0 rounded-full bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-80 max-sm:h-11"
        >
          {t("preview.continue_button")}
        </button>
        <IconTooltip label={t("actions.dismiss")}>
          <button
            onClick={onDismiss}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground max-sm:size-11"
            aria-label={t("actions.dismiss")}
          >
            <X className="size-4" />
          </button>
        </IconTooltip>
      </div>
    </div>
  );
}
