import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";

import { BookmarkTagsEditor } from "./BookmarkTagsEditor";

/**
 * Straight to adding a tag, rather than to the first chip's remove button. A touch
 * screen's keyboard can wait, as it may be about removing one.
 */
export function useFocusTagInputOnOpen() {
  const contentRef = useRef<HTMLDivElement>(null);
  const isTouch = useMediaQuery("(pointer: coarse)");
  return {
    ref: contentRef,
    onOpenAutoFocus: (e: Event) => {
      e.preventDefault();
      if (!isTouch) {
        contentRef.current?.querySelector("input")?.focus();
      }
    },
  };
}

export default function TagModal({
  bookmark: initialData,
  open,
  setOpen,
}: {
  bookmark: ZBookmark;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const focusTagInput = useFocusTagInputOnOpen();
  // The grid's copy can be behind the card's, which keeps itself up to date
  const { data: bookmark } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      { bookmarkId: initialData.id },
      { initialData },
    ),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" {...focusTagInput}>
        <DialogHeader>
          <DialogTitle>{t("actions.edit_tags")}</DialogTitle>
        </DialogHeader>
        <BookmarkTagsEditor bookmark={bookmark} variant="inline" />
      </DialogContent>
    </Dialog>
  );
}

export function useTagModal(bookmark: ZBookmark) {
  const [open, setOpen] = useState(false);

  return {
    open,
    setOpen,
    content: open && (
      <TagModal bookmark={bookmark} open={open} setOpen={setOpen} />
    ),
  };
}
