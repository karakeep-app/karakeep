import { useEffect, useState } from "react";
import { Check } from "lucide-react";

import {
  useAutoRefreshingBookmarkQuery,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";

import Spinner from "../Spinner";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export function NoteEditor({ bookmarkId }: { bookmarkId: string }) {
  const { data: bookmark } = useAutoRefreshingBookmarkQuery({ bookmarkId });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Update local state when bookmark changes, but only if there are no unsaved changes
  // This prevents overwriting user's edits while they're typing
  useEffect(() => {
    if (bookmark && !hasUnsavedChanges) {
      setNoteValue(bookmark.note ?? "");
    }
  }, [bookmark?.note, bookmark, hasUnsavedChanges]);

  const updateBookmarkMutator = useUpdateBookmark({
    onSuccess: () => {
      setError(null);
      setIsSaving(false);
      setHasUnsavedChanges(false);
    },
    onError: (e) => {
      setError(e.message || "Failed to save note");
      setIsSaving(false);
    },
  });

  const handleSave = () => {
    if (!bookmark || noteValue === bookmark.note || isSaving) {
      return;
    }
    setIsSaving(true);
    setError(null);
    updateBookmarkMutator.mutate({
      bookmarkId: bookmark.id,
      note: noteValue,
    });
  };

  if (!bookmark) {
    return null;
  }

  const showStatusRow = isSaving || !!error || hasUnsavedChanges;

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        autoFocus
        className="h-24 w-full resize-none overflow-auto bg-background text-sm"
        value={noteValue}
        placeholder="Add a note…"
        onChange={(e) => {
          setNoteValue(e.currentTarget.value);
          setHasUnsavedChanges(e.currentTarget.value !== bookmark.note);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSave();
          }
        }}
      />
      {!showStatusRow && noteValue && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3.5 text-green-600 dark:text-green-500" />
          Saved
        </p>
      )}
      {showStatusRow && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 text-xs">
            {error ? (
              <p className="text-destructive">{error}</p>
            ) : (
              hasUnsavedChanges &&
              !isSaving && (
                <p className="text-muted-foreground">Unsaved changes</p>
              )
            )}
          </div>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
          >
            {isSaving ? (
              <Spinner className="size-3.5" />
            ) : (
              <Check className="size-3.5" />
            )}
            {isSaving ? "Saving…" : "Save note"}
          </Button>
        </div>
      )}
    </div>
  );
}
