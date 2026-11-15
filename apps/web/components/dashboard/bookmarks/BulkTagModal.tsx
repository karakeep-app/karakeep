import { useState } from "react";
import { ActionButtonWithTooltip } from "@/components/ui/action-button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import LoadingSpinner from "@/components/ui/spinner";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { useQueries } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { useUpdateBookmarkTags } from "@karakeep/shared-react/hooks/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { limitConcurrency } from "@karakeep/shared/concurrency";
import { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { ZBookmarkTags } from "@karakeep/shared/types/tags";

import { useFocusTagInputOnOpen } from "./TagModal";
import { TagsEditor } from "./TagsEditor";

const TAG_ROW_BUTTON_CLASS =
  "size-8 shrink-0 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] max-sm:size-11 [@media(pointer:coarse)]:size-11";

function TagRow({
  name,
  count,
  total,
  onAddToAll,
  onRemove,
}: {
  name: string;
  count: number;
  total: number;
  onAddToAll: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<"add" | "remove" | null>(null);
  const run = async (action: "add" | "remove", work: () => Promise<void>) => {
    setPending(action);
    try {
      await work();
    } finally {
      setPending(null);
    }
  };
  const addLabel = t("dialogs.bookmarks.bulk_tag_add_to_all", { name });
  const removeLabel = t("tags.remove_named", { name });
  return (
    <li className="flex min-h-9 items-center gap-2 rounded-sm pl-2 hover:bg-accent/50">
      <span className="min-w-0 truncate text-sm">{name}</span>
      <span aria-hidden className="shrink-0 text-muted-foreground">
        ·
      </span>
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
        {t("dialogs.bookmarks.bulk_tag_count", { count, total })}
      </span>
      <div className="ml-auto flex shrink-0 items-center">
        {count < total && (
          <ActionButtonWithTooltip
            tooltip={addLabel}
            aria-label={addLabel}
            delayDuration={300}
            type="button"
            variant="ghost"
            size="none"
            className={TAG_ROW_BUTTON_CLASS}
            loading={pending === "add"}
            disabled={pending !== null}
            spinner={<LoadingSpinner className="size-4" />}
            onClick={() => run("add", onAddToAll)}
          >
            <Plus className="size-4" />
          </ActionButtonWithTooltip>
        )}
        <ActionButtonWithTooltip
          tooltip={removeLabel}
          aria-label={removeLabel}
          delayDuration={300}
          type="button"
          variant="ghost"
          size="none"
          className={TAG_ROW_BUTTON_CLASS}
          loading={pending === "remove"}
          disabled={pending !== null}
          spinner={<LoadingSpinner className="size-4" />}
          onClick={() => run("remove", onRemove)}
        >
          <X className="size-4" />
        </ActionButtonWithTooltip>
      </div>
    </li>
  );
}

export default function BulkTagModal({
  bookmarkIds,
  open,
  setOpen,
}: {
  bookmarkIds: string[];
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const api = useTRPC();
  const focusTagInput = useFocusTagInputOnOpen();
  const results = useQueries({
    queries: bookmarkIds.map((id) =>
      api.bookmarks.getBookmark.queryOptions({ bookmarkId: id }),
    ),
  });

  const bookmarks = results
    .map((r) => r.data)
    .filter((b): b is ZBookmark => !!b);

  const { mutateAsync } = useUpdateBookmarkTags({
    onError: (err) => {
      if (err.data?.code == "BAD_REQUEST") {
        if (err.data.zodError) {
          toast({
            variant: "destructive",
            description: Object.values(err.data.zodError.fieldErrors)
              .flat()
              .join("\n"),
          });
        } else {
          toast({
            variant: "destructive",
            description: err.message,
          });
        }
      } else {
        toast({
          variant: "destructive",
          title: t("common.something_went_wrong"),
        });
      }
    },
  });

  const onAttach = async (tag: { tagName: string; tagId?: string }) => {
    const results = await Promise.allSettled(
      limitConcurrency(
        bookmarkIds.map(
          (id) => () =>
            mutateAsync({
              bookmarkId: id,
              attach: [tag],
              detach: [],
            }),
        ),
        50,
      ),
    );
    const successes = results.filter((r) => r.status == "fulfilled").length;
    toast({
      description: t("toasts.bookmarks.bulk_tag_added", {
        tag: tag.tagName,
        count: successes,
      }),
    });
  };

  const onDetach = async ({
    tagId,
    tagName,
  }: {
    tagId: string;
    tagName: string;
  }) => {
    const results = await Promise.allSettled(
      limitConcurrency(
        bookmarkIds.map(
          (id) => () =>
            mutateAsync({
              bookmarkId: id,
              attach: [],
              detach: [{ tagId }],
            }),
        ),
        50,
      ),
    );
    const successes = results.filter((r) => r.status == "fulfilled").length;
    toast({
      description: t("toasts.bookmarks.bulk_tag_removed", {
        tag: tagName,
        count: successes,
      }),
    });
  };

  // Every tag on the selection, with the ones most of it has first
  const tagCounts = new Map<string, { tag: ZBookmarkTags; count: number }>();
  for (const tag of bookmarks.flatMap((b) => b.tags)) {
    const row = tagCounts.get(tag.id);
    tagCounts.set(tag.id, { tag, count: (row?.count ?? 0) + 1 });
  }
  const rows = [...tagCounts.values()].sort(
    (a, b) => b.count - a.count || a.tag.name.localeCompare(b.tag.name),
  );
  const isLoading = results.some((r) => r.isPending);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" {...focusTagInput}>
        <DialogHeader>
          <DialogTitle>
            {t("dialogs.bookmarks.bulk_edit_tags_title", {
              count: bookmarkIds.length,
            })}
          </DialogTitle>
        </DialogHeader>
        <TagsEditor
          tags={[]}
          addOnly
          onAttach={onAttach}
          onDetach={onDetach}
          variant="inline"
        />
        {/* Tall enough for the list of tags to add, which opens over this rather
            than spilling out of the dialog */}
        <DialogBody className="h-80 max-h-[50dvh] flex-none">
          <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">
            {t("dialogs.bookmarks.bulk_tags_of_selection")}
          </h3>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <LoadingSpinner className="size-4" />
            </div>
          ) : rows.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">
              {t("dialogs.bookmarks.bulk_tags_none")}
            </p>
          ) : (
            <ul>
              {rows.map(({ tag, count }) => (
                <TagRow
                  key={tag.id}
                  name={tag.name}
                  count={count}
                  total={bookmarkIds.length}
                  onAddToAll={() =>
                    onAttach({ tagName: tag.name, tagId: tag.id })
                  }
                  onRemove={() =>
                    onDetach({ tagId: tag.id, tagName: tag.name })
                  }
                />
              ))}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
