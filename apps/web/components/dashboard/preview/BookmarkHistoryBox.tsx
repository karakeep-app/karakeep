import { useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import RelativeTime from "@/components/ui/relative-time";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import LoadingSpinner from "@/components/ui/spinner";
import { formatLocalDate } from "@/lib/date-format";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, Undo2 } from "lucide-react";

import { useRollbackBookmarkEdit } from "@karakeep/shared-react/hooks/bookmarks";

import type {
  ZBookmarkHistoryChange,
  ZBookmarkHistoryEvent,
  ZBookmarkHistoryField,
  ZBookmarkHistoryItem,
  ZBookmarkHistoryValue,
} from "@karakeep/shared/types/bookmarkHistory";
import type { ZAssetType } from "@karakeep/shared/types/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { isCollectionHistoryField } from "@karakeep/shared/types/bookmarkHistory";
import { humanFriendlyNameForAssertType } from "@karakeep/shared/utils/assetUtils";

const FIELD_LABEL_KEYS = {
  created: "preview.history.fields.created",
  title: "preview.history.fields.title",
  url: "preview.history.fields.url",
  description: "preview.history.fields.description",
  author: "preview.history.fields.author",
  publisher: "preview.history.fields.publisher",
  datePublished: "preview.history.fields.datePublished",
  createdAt: "preview.history.fields.createdAt",
  text: "preview.history.fields.text",
  note: "preview.history.fields.note",
  summary: "preview.history.fields.summary",
  archived: "preview.history.fields.archived",
  favourited: "preview.history.fields.favourited",
  tags: "preview.history.fields.tags",
  lists: "preview.history.fields.lists",
  attachments: "preview.history.fields.attachments",
} as const satisfies Record<ZBookmarkHistoryField, string>;

const DATE_FIELDS: readonly ZBookmarkHistoryField[] = [
  "datePublished",
  "createdAt",
];

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
  if (value === null || value === "" || Array.isArray(value)) {
    text = t("preview.history.empty_value");
    isEmpty = true;
  } else if (typeof value === "boolean") {
    text = value ? t("preview.history.yes") : t("preview.history.no");
  } else if (DATE_FIELDS.includes(field)) {
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

function itemLabel(item: ZBookmarkHistoryItem) {
  if (item.name) {
    return item.name;
  }
  return item.assetType
    ? humanFriendlyNameForAssertType(item.assetType as ZAssetType)
    : item.id;
}

function HistoryItems({
  items,
  removed,
}: {
  items: ZBookmarkHistoryItem[];
  removed?: boolean;
}) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="sr-only">
        {removed ? t("preview.history.removed") : t("preview.history.added")}
      </span>
      {items.map((item) => (
        <span
          key={item.id}
          className={cn(
            "inline-flex max-w-full items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-xs",
            removed
              ? "border-dashed text-muted-foreground line-through"
              : "border-border bg-muted/50",
          )}
        >
          <span aria-hidden className="no-underline">
            {removed ? "−" : "+"}
          </span>
          <span className="truncate">{itemLabel(item)}</span>
        </span>
      ))}
    </div>
  );
}

function HistoryChange({ change }: { change: ZBookmarkHistoryChange }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-col gap-0.5" data-history-field={change.field}>
      <span className="text-xs text-muted-foreground">
        {t(FIELD_LABEL_KEYS[change.field])}
      </span>
      {isCollectionHistoryField(change.field) ? (
        <div className="flex flex-col gap-1">
          <HistoryItems
            items={Array.isArray(change.oldValue) ? change.oldValue : []}
            removed
          />
          <HistoryItems
            items={Array.isArray(change.newValue) ? change.newValue : []}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <HistoryValue field={change.field} value={change.oldValue} previous />
          <ArrowRight
            aria-hidden
            className="size-3 shrink-0 text-muted-foreground"
          />
          <HistoryValue field={change.field} value={change.newValue} />
        </div>
      )}
    </li>
  );
}

function HistoryEvent({ event }: { event: ZBookmarkHistoryEvent }) {
  const { t } = useTranslation();
  const isCreation = event.changes.some((c) => c.field === "created");
  const changes = event.changes.filter((c) => c.field !== "created");
  return (
    <li
      className={cn(
        "flex flex-col gap-2 border-l-2 pl-3",
        // The latest edit, which can still be undone.
        event.pending ? "border-primary" : "border-border",
      )}
      data-history-event={event.id}
      data-history-pending={event.pending}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{event.editor.name}</span>
          <span className="shrink-0 text-muted-foreground">
            <RelativeTime date={event.createdAt} />
          </span>
        </span>
        <Badge variant="secondary" className="shrink-0 px-2 font-medium">
          {isCreation
            ? t("preview.history.created_event")
            : t("preview.history.updated_event")}
        </Badge>
      </div>
      {isCreation && changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("preview.history.bookmark_created")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {changes.map((change) => (
            <HistoryChange key={change.id} change={change} />
          ))}
        </ul>
      )}
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

  // History can be long and holds full old and new values (e.g. notes), so
  // it's only fetched once the section is opened.
  const { data, isError } = useQuery({
    ...api.bookmarks.getBookmarkHistory.queryOptions({ bookmarkId }),
    enabled: isOpen,
  });

  return (
    <>
      <Separator />
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11 [@media(pointer:coarse)]:min-h-11">
          {t("preview.history.title")}
          <ChevronRight
            className={cn("size-4 transition-transform", isOpen && "rotate-90")}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 py-3 text-sm">
          {data ? (
            <HistoryEvents
              bookmarkId={bookmarkId}
              events={data.events}
              canUndo={canUndo}
            />
          ) : isError ? (
            <p className="py-1 text-xs text-muted-foreground">
              {t("common.something_went_wrong")}
            </p>
          ) : (
            <LoadingSpinner className="size-4 self-center" />
          )}
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

function HistoryEvents({
  bookmarkId,
  events,
  canUndo,
}: {
  bookmarkId: string;
  events: ZBookmarkHistoryEvent[];
  canUndo: boolean;
}) {
  const { t } = useTranslation();
  const hasPendingEdit = events.some((event) => event.pending);

  return (
    <>
      {canUndo && hasPendingEdit && <UndoLatestEdit bookmarkId={bookmarkId} />}
      {events.length === 0 ? (
        <p className="py-1 text-xs text-muted-foreground">
          {t("preview.history.empty")}
        </p>
      ) : (
        <ol
          className="flex flex-col gap-4"
          aria-label={t("preview.history.title")}
        >
          {events.map((event) => (
            <HistoryEvent key={event.id} event={event} />
          ))}
        </ol>
      )}
    </>
  );
}
