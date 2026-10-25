import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  useAutoRefreshingBookmarkQuery,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { isBookmarkStillCrawling } from "@karakeep/shared/utils/bookmarkUtils";

import Spinner from "../Spinner";
import { useTRPC } from "../utils/trpc";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

// The title shown when the user hasn't set one. The crawler fills it in, so it
// can change while the popup is open; it's only ever used as the placeholder.
function getFallbackTitle(bookmark: ZBookmark) {
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      return bookmark.content.title ?? null;
    case BookmarkTypes.ASSET:
      return bookmark.content.fileName ?? null;
    default:
      return null;
  }
}

export function TitleEditor({ bookmarkId }: { bookmarkId: string }) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const { data: bookmark } = useAutoRefreshingBookmarkQuery({ bookmarkId });
  // The user's in-progress edit; null when not editing. While editing, the
  // field shows the draft, so refreshes (e.g. the crawl finishing) can't
  // overwrite what's being typed.
  const [draft, setDraft] = useState<string | null>(null);

  const { mutate, isPending, error } = useUpdateBookmark({
    // Stay pending until the refreshed bookmark is in, so the field never
    // briefly shows the pre-save title.
    onSuccess: () =>
      queryClient
        .invalidateQueries(
          api.bookmarks.getBookmark.queryFilter({ bookmarkId }),
        )
        .then(() => setDraft(null)),
  });

  if (!bookmark) {
    return null;
  }

  // Only the user's own title is edited. An empty field clears it, so the
  // crawled title shows again.
  const newTitle = draft?.trim() || null;
  const hasChanges = draft !== null && newTitle !== (bookmark.title ?? null);

  const save = () => {
    if (hasChanges && !isPending) {
      mutate({ bookmarkId, title: newTitle });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={draft ?? bookmark.title ?? ""}
        placeholder={
          getFallbackTitle(bookmark) ??
          (isBookmarkStillCrawling(bookmark) ? "Fetching title…" : "Untitled")
        }
        aria-label="Title"
        disabled={isPending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape" && draft !== null) {
            e.preventDefault();
            setDraft(null);
          }
        }}
      />
      {(hasChanges || isPending) && (
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-xs">
            {error ? (
              <span className="text-destructive">
                {error.message || "Failed to save title"}
              </span>
            ) : (
              <span className="text-muted-foreground">Unsaved changes</span>
            )}
          </p>
          <Button
            onClick={save}
            disabled={isPending || !hasChanges}
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
          >
            {isPending ? (
              <Spinner className="size-3.5" />
            ) : (
              <Check className="size-3.5" />
            )}
            {isPending ? "Saving…" : "Save title"}
          </Button>
        </div>
      )}
    </div>
  );
}
