import { Textarea } from "@/components/ui/textarea";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { useNoteDraft } from "./useNoteDraft";

export function NoteEditor({
  bookmark,
  disabled,
}: {
  bookmark: ZBookmark;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const isReadOnly = !!useClientConfig().demoMode || disabled;
  const label = t("common.note");
  const { value, status, flush, onChange } = useNoteDraft(
    bookmark.id,
    bookmark.note ?? "",
  );
  const statusText = {
    idle: t("preview.saves_automatically"),
    saving: t("preview.saving"),
    saved: t("preview.saved"),
    failed: t("preview.save_failed"),
  }[status];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {!isReadOnly && (
          <span
            role="status"
            className={
              status === "failed"
                ? "text-xs text-destructive"
                : "text-xs text-muted-foreground"
            }
          >
            {statusText}
          </span>
        )}
      </div>
      <Textarea
        className="min-h-[5rem] w-full resize-y overflow-auto rounded-md bg-background p-2.5 text-sm text-foreground placeholder:text-muted-foreground dark:bg-accent/60"
        value={value}
        disabled={isReadOnly}
        aria-label={label}
        placeholder={t("preview.note_placeholder")}
        onChange={(e) => onChange(e.currentTarget.value)}
        onBlur={flush}
      />
    </div>
  );
}
