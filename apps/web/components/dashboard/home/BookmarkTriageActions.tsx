"use client";

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslation } from "@/lib/i18n/client";
import { addDays } from "date-fns";
import { BookCheck, Clock, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  useSummarizeBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

function TriageButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export function BookmarkTriageActions({ bookmark }: { bookmark: ZBookmark }) {
  const { t } = useTranslation();
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  const updateBookmarkMutator = useUpdateBookmark({
    onSuccess: () => {
      toast.success(t("toasts.bookmarks.updated"));
    },
    onError: () => {
      toast.error(t("common.something_went_wrong"));
    },
  });
  const { mutate: summarize, isPending: isSummarizing } = useSummarizeBookmark({
    onError: () => {
      toast.error(t("common.something_went_wrong"));
    },
  });

  const snooze = (until: Date) => {
    updateBookmarkMutator.mutate({
      bookmarkId: bookmark.id,
      snoozedUntil: until,
    });
    setSnoozeOpen(false);
  };

  return (
    <div className="flex items-center gap-1">
      <TriageButton
        title={t("actions.read_it")}
        disabled={updateBookmarkMutator.isPending}
        onClick={() =>
          updateBookmarkMutator.mutate({
            bookmarkId: bookmark.id,
            archived: true,
          })
        }
      >
        <BookCheck className="size-4" />
      </TriageButton>
      {bookmark.content.type === BookmarkTypes.LINK && (
        <TriageButton
          title={t("actions.summarize_with_ai")}
          disabled={isSummarizing}
          onClick={() => summarize({ bookmarkId: bookmark.id })}
        >
          <Sparkles className="size-4" />
        </TriageButton>
      )}
      <Popover open={snoozeOpen} onOpenChange={setSnoozeOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={t("actions.snooze")}
            aria-label={t("actions.snooze")}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Clock className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-2"
          align="start"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => snooze(addDays(new Date(), 1))}
            >
              {t("actions.snooze_tomorrow")}
            </button>
            <button
              type="button"
              className="rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => snooze(addDays(new Date(), 7))}
            >
              {t("actions.snooze_next_week")}
            </button>
          </div>
          <div className="mt-1 border-t pt-1">
            <Calendar
              mode="single"
              selected={undefined}
              onSelect={(date) => date && snooze(date)}
              disabled={(date) => date < new Date()}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
