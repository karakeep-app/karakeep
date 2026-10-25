import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  useAutoRefreshingBookmarkQuery,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { isBookmarkStillCrawling } from "@karakeep/shared/utils/bookmarkUtils";

import Spinner from "../Spinner";
import { Input } from "./ui/input";

// The title the bookmark falls back to when the user hasn't set one. This is
// what the crawler fills in, so it can change while the popup is open.
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
  const { data: bookmark } = useAutoRefreshingBookmarkQuery({ bookmarkId });
  const inputRef = useRef<HTMLInputElement>(null);
  // Only the user's own title (`bookmark.title`) is ever shown as the value;
  // the crawled title is just the placeholder. That way a crawl finishing
  // mid-edit can never replace what the user typed.
  const [value, setValue] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const valueRef = useRef(value);
  valueRef.current = value;

  // Pick up title changes from the server (e.g. edited elsewhere), but only
  // when they actually change and the user isn't in the middle of editing.
  const lastServerTitle = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!bookmark || bookmark.title === lastServerTitle.current) {
      return;
    }
    lastServerTitle.current = bookmark.title;
    if (!isDirty && !isFocused) {
      setValue(bookmark.title ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmark?.title]);

  const { mutate: updateBookmark, isPending } = useUpdateBookmark({
    onSuccess: (_res, req) => {
      setError(null);
      // Don't drop edits the user made while the request was in flight.
      if ((req.title ?? "") === valueRef.current.trim()) {
        setIsDirty(false);
        setJustSaved(true);
      }
    },
    onError: (e) => {
      setError(e.message || "Failed to save title");
    },
  });

  if (!bookmark) {
    return null;
  }

  const fallbackTitle = getFallbackTitle(bookmark);
  const placeholder =
    fallbackTitle ??
    (isBookmarkStillCrawling(bookmark) ? "Fetching title…" : "Untitled");

  const commit = () => {
    if (!isDirty) {
      // Nothing typed: undo any prefill from focusing.
      setValue(bookmark.title ?? "");
      return;
    }
    const newTitle = value.trim();
    if (newTitle === (bookmark.title ?? "")) {
      setIsDirty(false);
      setValue(bookmark.title ?? "");
      return;
    }
    setJustSaved(false);
    // An empty title clears the user's title so the crawled one shows again.
    updateBookmark({ bookmarkId, title: newTitle === "" ? null : newTitle });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          aria-label="Title"
          className="pr-9"
          onFocus={() => {
            setIsFocused(true);
            // Start from the crawled title so it can be tweaked rather than
            // retyped. This isn't saved unless the user actually edits it.
            if (!isDirty && !bookmark.title && fallbackTitle) {
              setValue(fallbackTitle);
            }
          }}
          onBlur={() => {
            setIsFocused(false);
            commit();
          }}
          onChange={(e) => {
            setValue(e.target.value);
            setIsDirty(true);
            setJustSaved(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              inputRef.current?.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setIsDirty(false);
              setValue(bookmark.title ?? "");
              // Blurring would commit; skip it by resetting first.
              setTimeout(() => inputRef.current?.blur());
            }
          }}
        />
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
          {isPending ? (
            <Spinner className="size-3.5" />
          ) : (
            justSaved &&
            !isDirty && (
              <Check className="size-3.5 text-green-600 dark:text-green-500" />
            )
          )}
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
