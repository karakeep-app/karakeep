import { useState } from "react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";

import { Textarea } from "./ui/textarea";

export function NoteEditor({ bookmark }: { bookmark: ZBookmark }) {
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const updateBookmarkMutator = useUpdateBookmark({
    onSuccess: () => {
      setError(null);
      setIsSaving(false);
    },
    onError: (e) => {
      setError(e.message || "Failed to save note");
      setIsSaving(false);
    },
  });

  return (
    <div className="flex flex-col gap-1">
      <Textarea
        className="h-32 w-full overflow-auto rounded bg-background p-2 text-sm text-gray-400 dark:text-gray-300"
        defaultValue={bookmark.note ?? ""}
        placeholder="Write some notes ..."
        onBlur={(e) => {
          if (e.currentTarget.value === bookmark.note) {
            return;
          }
          setIsSaving(true);
          setError(null);
          updateBookmarkMutator.mutate({
            bookmarkId: bookmark.id,
            note: e.currentTarget.value,
          });
        }}
      />
      {isSaving && (
        <p className="text-xs text-gray-500">Saving note...</p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
