import { useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import RelativeTime from "@/components/ui/relative-time";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { formatLocalDate } from "@/lib/date-format";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, Undo2 } from "lucide-react";

import { useRollbackBookmarkEdit } from "@karakeep/shared-react/hooks/bookmarks";

import type {
  ZBookmarkHistoryEntry,
  ZBookmarkHistoryField,
  ZBookmarkHistoryValue,
} from "@karakeep/shared/types/bookmarkHistory";
import { useTRPC } from "@karakeep/shared-react/trpc";

const FIELD_LABEL_KEYS = {
  title: "preview.history.fields.title",
  url: "preview.history.fields.url",
  description: "preview.history.fields.description",
  author: "preview.history.fields.author",
  publisher: "preview.history.fields.publisher",
  datePublished: "preview.history.fields.datePublished",
  note: "preview.history.fields.note",
  summary: "preview.history.fields.summary",
  archived: "preview.history.fields.archived",
  favourited: "preview.history.fields.favourited",
} as const satisfies Record<ZBookmarkHistoryField, string>;

function HistoryValue({
  field,
  value,
  previous,
}: {
  field: ZBookmarkHistoryField;
  value: ZBookmarkHistoryValue;
  previous?: boolean;
}) {
  const { t, i18n } = useTranslation();

  let text: string;
  let isEmpty = false;
  if (value === null || value === "") {
    text = t("preview.history.empty_value");
    isEmpty = true;
  } else if (typeof value === "boolean") {
    text = value ? t("preview.history.yes") : t("preview.history.no");
  } else if (field === "datePublished") {
    text = formatLocalDate(new Date(value), "PP", i18n.language);
  } else {
    text = value;
  }

  return (
    <span
      title={isEmpty ? undefined : text}
      className={cn(
        "line-clamp-3 min-w-0 whitespace-pre-wrap break-words",
        previous && "text-muted-foreground line-through",
        isEmpty && "italic text-muted-foreground no-underline",
      )}
    >
      {text}
    </span>
  );
}

function HistoryRow({ entry }: { entry: ZBookmarkHistoryEntry }) {
  const { t } = useTranslation();
  return (
    <li
      className={cn(
        "flex flex-col gap-1 border-l-2 pl-3",
        // The latest edit, which can still be undone.
        entry.pending ? "border-primary" : "border-border",
      )}
      data-history-field={entry.field}
      data-history-pending={entry.pending}
    >
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{t(FIELD_LABEL_KEYS[entry.field])}</span>
        <span className="shrink-0 text-muted-foreground">
          <RelativeTime date={entry.createdAt} />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <HistoryValue field={entry.field} value={entry.oldValue} previous />
        <ArrowRight
          aria-hidden
          className="size-3 shrink-0 text-muted-foreground"
        />
        <HistoryValue field={entry.field} value={entry.newValue} />
      </div>
      <span className="text-xs text-muted-foreground">
        {t("preview.history.edited_by", { name: entry.editor.name })}
      </span>
    </li>
  );
}

function UndoLatestEdit({ bookmarkId }: { bookmarkId: string }) {
  const { t } = useTranslation();
  const { mutate, isPending } = useRollbackBookmarkEdit({
    onSuccess: () => {
      toast({ description: t("preview.history.undone") });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: t("preview.history.undo_failed"),
        description: error.message,
      });
    },
  });

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground">
      <span>{t("preview.history.latest_edit")}</span>
      <ActionButton
        variant="outline"
        size="sm"
        loading={isPending}
        onClick={() => mutate({ bookmarkId })}
      >
        <Undo2 className="size-3.5" />
        {t("preview.history.undo")}
      </ActionButton>
    </div>
  );
}

export default function BookmarkHistoryBox({
  bookmarkId,
  canUndo,
}: {
  bookmarkId: string;
  // Only the owner can roll back (they're the only one who can edit).
  canUndo: boolean;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const { data, isPending } = useQuery(
    api.bookmarks.getBookmarkHistory.queryOptions({ bookmarkId }),
  );

  if (isPending || !data) {
    return null;
  }

  const { entries } = data;
  const hasPendingEdit = entries.some((entry) => entry.pending);

  return (
    <>
      <Separator />
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11 [@media(pointer:coarse)]:min-h-11">
          <span className="flex items-center gap-2">
            {t("preview.history.title")}
            <span className="font-normal tabular-nums">{entries.length}</span>
          </span>
          <ChevronRight
            className={cn("size-4 transition-transform", isOpen && "rotate-90")}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 py-3 text-sm">
          {canUndo && hasPendingEdit && (
            <UndoLatestEdit bookmarkId={bookmarkId} />
          )}
          {entries.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">
              {t("preview.history.empty")}
            </p>
          ) : (
            <ol
              className="flex flex-col gap-3"
              aria-label={t("preview.history.title")}
            >
              {entries.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))}
            </ol>
          )}
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
