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

  // Saves are serialised: at most one request in flight, with the latest edit
  // queued behind it, so a quick A -> B -> A can't end on B. `undefined` means
  // "nothing" (null is a valid title: it clears the user's title).
  const inFlightTitle = useRef<string | null | undefined>(undefined);
  const queuedTitle = useRef<string | null | undefined>(undefined);
  // The title the last successful save wrote. The cached bookmark only learns
  // about it once the post-save refetch lands, so until then this is the
  // source of truth for what the server holds.
  const savedTitle = useRef<string | null | undefined>(undefined);
  // What focusing pre-filled the field with (the crawled title), so getting
  // back to exactly that text doesn't count as an edit.
  const prefilledTitle = useRef<string | null>(null);

  // Pick up title changes from the server (e.g. edited elsewhere), but only
  // when they actually change and the user isn't in the middle of editing.
  const lastServerTitle = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!bookmark || bookmark.title === lastServerTitle.current) {
      return;
    }
    lastServerTitle.current = bookmark.title;
    if (savedTitle.current !== undefined) {
      if ((bookmark.title ?? null) !== savedTitle.current) {
        // A refetch from before our latest save; wait for the one after it.
        return;
      }
      savedTitle.current = undefined;
    }
    if (!isDirty && !isFocused) {
      setValue(bookmark.title ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmark?.title]);

  const { mutate: updateBookmark, isPending } = useUpdateBookmark({
    onSuccess: (_res, req) => {
      setError(null);
      savedTitle.current = req.title ?? null;
      // Don't drop edits the user made while the request was in flight.
      if (
        queuedTitle.current === undefined &&
        (req.title ?? "") === valueRef.current.trim()
      ) {
        setIsDirty(false);
        setJustSaved(true);
      }
    },
    onError: (e) => {
      setError(e.message || "Failed to save title");
    },
    onSettled: () => {
      inFlightTitle.current = undefined;
      const next = queuedTitle.current;
      if (next !== undefined) {
        queuedTitle.current = undefined;
        sendTitle(next);
      }
    },
  });

  const sendTitle = (title: string | null) => {
    if (inFlightTitle.current !== undefined) {
      queuedTitle.current = title;
      return;
    }
    inFlightTitle.current = title;
    updateBookmark({ bookmarkId, title });
  };

  if (!bookmark) {
    return null;
  }

  const fallbackTitle = getFallbackTitle(bookmark);
  const placeholder =
    fallbackTitle ??
    (isBookmarkStillCrawling(bookmark) ? "Fetching title…" : "Untitled");

  // The user's title as far as we know, including saves the cache hasn't
  // caught up with yet.
  const currentTitle =
    savedTitle.current !== undefined
      ? savedTitle.current
      : (bookmark.title ?? null);

  const commit = () => {
    const prefilled = prefilledTitle.current;
    prefilledTitle.current = null;
    if (!isDirty) {
      // Nothing typed: undo any prefill from focusing.
      setValue(currentTitle ?? "");
      return;
    }
    // An empty title clears the user's title so the crawled one shows again.
    const newTitle = value.trim() === "" ? null : value.trim();
    // What the server will hold once the saves already sent have landed.
    const expectedTitle =
      queuedTitle.current !== undefined
        ? queuedTitle.current
        : inFlightTitle.current !== undefined
          ? inFlightTitle.current
          : currentTitle;
    const isUnchanged =
      newTitle === expectedTitle ||
      // Back to the untouched pre-filled crawled title: still no title of
      // the user's own, so the crawler can keep updating it.
      (expectedTitle === null && newTitle === prefilled?.trim());
    if (isUnchanged) {
      // Nothing new to send. If a save is still pending, its success clears
      // the dirty state once the value matches.
      if (inFlightTitle.current === undefined) {
        setIsDirty(false);
        setValue(expectedTitle ?? "");
      }
      return;
    }
    setJustSaved(false);
    sendTitle(newTitle);
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
            if (!isDirty && currentTitle === null && fallbackTitle) {
              prefilledTitle.current = fallbackTitle;
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
              setValue(currentTitle ?? "");
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
