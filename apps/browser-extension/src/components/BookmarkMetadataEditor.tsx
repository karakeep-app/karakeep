import { FormEvent, useEffect, useState } from "react";
import { Check, Save, Star } from "lucide-react";

import { MAX_BOOKMARK_TITLE_LENGTH } from "@karakeep/shared/types/bookmarks";
import {
  useAutoRefreshingBookmarkQuery,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";

import Spinner from "../Spinner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface TitleState {
  draft: string;
  saved: string;
}

export function BookmarkMetadataEditor({ bookmarkId }: { bookmarkId: string }) {
  const {
    data: bookmark,
    error: bookmarkError,
    isPending: isBookmarkPending,
    refetch,
  } = useAutoRefreshingBookmarkQuery({ bookmarkId });
  const [titleState, setTitleState] = useState<TitleState | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [favouriteError, setFavouriteError] = useState<string | null>(null);
  const [favouriteOverride, setFavouriteOverride] = useState<boolean | null>(
    null,
  );

  const serverTitle = bookmark?.title ?? "";
  useEffect(() => {
    setTitleState((current) => {
      if (current && current.draft !== current.saved) {
        return current;
      }
      return { draft: serverTitle, saved: serverTitle };
    });
  }, [serverTitle]);

  const serverFavourite = bookmark?.favourited;
  useEffect(() => {
    if (
      serverFavourite !== undefined &&
      favouriteOverride === serverFavourite
    ) {
      setFavouriteOverride(null);
    }
  }, [serverFavourite, favouriteOverride]);

  const titleMutation = useUpdateBookmark({
    onSuccess: (updatedBookmark) => {
      const updatedTitle = updatedBookmark.title ?? "";
      setTitleState({ draft: updatedTitle, saved: updatedTitle });
      setTitleError(null);
    },
    onError: (error) => {
      setTitleError(error.message || "Failed to save title");
    },
  });

  const favouriteMutation = useUpdateBookmark({
    onSuccess: (updatedBookmark) => {
      setFavouriteOverride(updatedBookmark.favourited);
      setFavouriteError(null);
    },
    onError: (error) => {
      setFavouriteOverride(null);
      setFavouriteError(error.message || "Failed to update favourite");
    },
  });

  if (isBookmarkPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        <span>Loading bookmark details...</span>
      </div>
    );
  }

  if (bookmarkError || !bookmark) {
    return (
      <div className="flex flex-col gap-2" role="alert">
        <p className="text-sm text-red-500">Could not load bookmark details.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Try Again
        </Button>
      </div>
    );
  }

  const resolvedTitleState = titleState ?? {
    draft: serverTitle,
    saved: serverTitle,
  };
  const isUpdating = titleMutation.isPending || favouriteMutation.isPending;
  const hasUnsavedTitle = resolvedTitleState.draft !== resolvedTitleState.saved;
  const isFavourited = favouriteOverride ?? bookmark.favourited;

  const saveTitle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasUnsavedTitle || isUpdating) {
      return;
    }

    setTitleError(null);
    titleMutation.mutate({
      bookmarkId,
      title:
        resolvedTitleState.draft.length > 0 ? resolvedTitleState.draft : null,
    });
  };

  const toggleFavourite = () => {
    if (isUpdating) {
      return;
    }

    const nextFavourite = !isFavourited;
    setFavouriteError(null);
    setFavouriteOverride(nextFavourite);
    favouriteMutation.mutate({
      bookmarkId,
      favourited: nextFavourite,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-lg" htmlFor="bookmark-title">
          Title
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          aria-label={
            isFavourited ? "Remove from favourites" : "Add to favourites"
          }
          aria-pressed={isFavourited}
          disabled={isUpdating}
          onClick={toggleFavourite}
        >
          {favouriteMutation.isPending ? (
            <Spinner />
          ) : (
            <Star
              aria-hidden="true"
              className="h-4 w-4"
              fill={isFavourited ? "#ebb434" : "none"}
              color={isFavourited ? "#ebb434" : "currentColor"}
            />
          )}
          {isFavourited ? "Favourited" : "Favourite"}
        </Button>
      </div>
      <form className="flex items-center gap-2" onSubmit={saveTitle}>
        <Input
          id="bookmark-title"
          maxLength={MAX_BOOKMARK_TITLE_LENGTH}
          placeholder="Untitled"
          value={resolvedTitleState.draft}
          onChange={(event) => {
            setTitleError(null);
            setTitleState((current) => ({
              saved: current?.saved ?? serverTitle,
              draft: event.currentTarget.value,
            }));
          }}
        />
        <Button
          type="submit"
          size="sm"
          className="gap-1.5"
          disabled={!hasUnsavedTitle || isUpdating}
        >
          {titleMutation.isPending ? (
            <>
              <Save aria-hidden="true" className="h-3.5 w-3.5 animate-pulse" />
              Saving...
            </>
          ) : hasUnsavedTitle ? (
            <>
              <Save aria-hidden="true" className="h-3.5 w-3.5" />
              Save
            </>
          ) : (
            <>
              <Check aria-hidden="true" className="h-3.5 w-3.5" />
              Saved
            </>
          )}
        </Button>
      </form>
      <div className="min-h-4 text-xs" aria-live="polite">
        {titleError && <p className="text-red-500">{titleError}</p>}
        {!titleError && hasUnsavedTitle && (
          <p className="text-amber-600 dark:text-amber-500">Unsaved changes</p>
        )}
        {favouriteError && <p className="text-red-500">{favouriteError}</p>}
      </div>
    </div>
  );
}
