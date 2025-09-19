import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n/client";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { BookmarkTagsEditor } from "./BookmarkTagsEditor";

export default function TagModal({
  bookmark,
  open,
  setOpen,
}: {
  bookmark: ZBookmark;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("actions.edit_tags")}</DialogTitle>
        </DialogHeader>
        <BookmarkTagsEditor bookmark={bookmark} />
        <DialogFooter className="sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t("actions.close")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useTagModel(bookmark: ZBookmark) {
  const [open, setOpen] = useState(false);

  return {
    open,
    setOpen,
    content: (
      <TagModal
        key={bookmark.id}
        bookmark={bookmark}
        open={open}
        setOpen={setOpen}
      />
    ),
  };
}
