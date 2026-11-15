import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";

const AUTOSAVE_DELAY_MS = 800;
const SAVE_FAILED_TOAST_ID = "note-save-failed";

/**
 * The text of a bookmark's note field. It's saved shortly after typing stops,
 * on blur, and when the field unmounts, since closing the preview with Escape
 * never blurs it.
 */
export function useNoteDraft(bookmarkId: string, savedNote: string) {
  const { t } = useTranslation();
  const api = useTRPC();
  const queryClient = useQueryClient();
  const bookmarkFilter = api.bookmarks.getBookmark.queryFilter({ bookmarkId });

  const [value, setValue] = useState(savedNote);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  // Typed here and not sent yet. Only typing sets it, so the hidden copy of
  // this field that the preview also mounts never saves its stale text.
  const unsavedRef = useRef<string | null>(null);
  const lastSentRef = useRef<string | null>(null);
  const timerRef = useRef<number>(undefined);

  const { mutate, isPending } = useUpdateBookmark({
    // Saves run one at a time, so an older text never lands after a newer one.
    scope: { id: `note-${bookmarkId}` },
    // The edit dialog takes the note from the cache as it opens.
    onMutate: ({ note }) => {
      queryClient.setQueriesData(
        bookmarkFilter,
        (bookmark) => bookmark && { ...bookmark, note },
      );
    },
    onSuccess: () => {
      if (unsavedRef.current === null) {
        setStatus("saved");
      }
      toast.dismiss(SAVE_FAILED_TOAST_ID);
    },
    onError: (_error, { note }) => {
      // A newer save is on its way, and replaces this one.
      if (typeof note !== "string" || note !== lastSentRef.current) {
        return;
      }
      unsavedRef.current ??= note;
      setStatus("failed");
      void queryClient.invalidateQueries(bookmarkFilter);
      toast.error(t("preview.note_save_failed"), {
        id: SAVE_FAILED_TOAST_ID,
        action: { label: t("actions.retry"), onClick: () => flush() },
      });
    },
  });

  const flush = () => {
    window.clearTimeout(timerRef.current);
    const note = unsavedRef.current;
    if (note === null) {
      return;
    }
    unsavedRef.current = null;
    lastSentRef.current = note;
    mutate({ bookmarkId, note });
  };

  useEffect(() => {
    // The browser asks before a reload or a closing tab drops unsent text.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (unsavedRef.current !== null) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      flush();
    };
  }, []);

  // Picks up changes from elsewhere, like the edit dialog, but never replaces
  // text that's still being typed or saved.
  useEffect(() => {
    if (unsavedRef.current === null && !isPending) {
      setValue(savedNote);
    }
  }, [savedNote]);

  return {
    value,
    status: isPending ? "saving" : status,
    flush,
    onChange: (note: string) => {
      setValue(note);
      setStatus("idle");
      unsavedRef.current = note;
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(flush, AUTOSAVE_DELAY_MS);
    },
  };
}
