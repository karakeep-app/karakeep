import { useEffect, useState } from "react";
import { Check, Save } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";

import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export function NoteEditor({ bookmark }: { bookmark: ZBookmark }) {
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [noteValue, setNoteValue] = useState(bookmark.note ?? "");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Update local state when bookmark changes
  useEffect(() => {
    setNoteValue(bookmark.note ?? "");
    setHasUnsavedChanges(false);
  }, [bookmark.note]);

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
    if (noteValue === bookmark.note || isSaving) {
      return;
    }
    setIsSaving(true);
    setError(null);
    updateBookmarkMutator.mutate({
      bookmarkId: bookmark.id,
      note: noteValue,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        className="h-32 w-full overflow-auto rounded bg-background p-2 text-sm text-gray-400 dark:text-gray-300"
        value={noteValue}
        placeholder="Write some notes ..."
        onChange={(e) => {
          setNoteValue(e.currentTarget.value);
          setHasUnsavedChanges(e.currentTarget.value !== bookmark.note);
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          {isSaving && <p className="text-xs text-gray-500">Saving note...</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
          {!isSaving && !error && hasUnsavedChanges && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Unsaved changes
            </p>
          )}
        </div>
        {hasUnsavedChanges && (
          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
            className="gap-1.5"
          >
            {isSaving ? (
              <>
                <Save className="h-3.5 w-3.5 animate-pulse" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                Save Note
              </>
            )}
          </Button>
        )}
        {!hasUnsavedChanges && !isSaving && noteValue && (
          <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-500">
            <Check className="h-3.5 w-3.5" />
            Saved
          </div>
        )}
      </div>
    </div>
  );
}
