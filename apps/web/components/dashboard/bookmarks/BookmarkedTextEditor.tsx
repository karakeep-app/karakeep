import { useId, useRef, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MarkdownEditor from "@/components/ui/markdown/markdown-editor";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";

import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import {
  MAX_BOOKMARK_TITLE_LENGTH,
  ZBookmark,
  ZBookmarkTypeText,
} from "@karakeep/shared/types/bookmarks";

export function BookmarkedTextEditor({
  bookmark,
  open,
  setOpen,
}: {
  bookmark: ZBookmark;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);
  const draftRef = useRef<{ markdown: string; isDirty: boolean } | null>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  // Unmounts with the dialog, so that each opening starts from the saved title.
  const titleRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const savedTitle = (bookmark.title ?? "").trim();
  const draftTitle = () => titleRef.current?.value.trim() ?? savedTitle;

  const close = () => {
    draftRef.current = null;
    setIsConfirmingClose(false);
    setOpen(false);
  };

  const { mutate: updateBookmark, isPending: isSaving } = useUpdateBookmark({
    onSuccess: () => {
      toast({ description: t("toasts.bookmarks.note_updated") });
      close();
    },
    // Back in the editor with the text intact, to try again.
    onError: () => {
      setIsConfirmingClose(false);
      toast({
        description: t("common.something_went_wrong"),
        variant: "destructive",
      });
    },
  });

  // The text is only sent if it changed: the editor has no draft until it does.
  const save = () => {
    const text = draftRef.current?.isDirty
      ? draftRef.current.markdown
      : undefined;
    const title = draftTitle() !== savedTitle ? draftTitle() : undefined;
    if (text === undefined && title === undefined) {
      close();
      return;
    }
    updateBookmark({
      bookmarkId: bookmark.id,
      ...(text !== undefined && { text }),
      ...(title !== undefined && { title: title || null }),
    });
  };

  // Escape, the backdrop and the close button all arrive here as onOpenChange.
  const requestClose = () => {
    if (draftRef.current?.isDirty || draftTitle() !== savedTitle) {
      setIsConfirmingClose(true);
    } else {
      close();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : requestClose())}
    >
      <DialogContent className="overflow-hidden max-sm:p-4 sm:max-w-[80%]">
        <DialogHeader className="flex max-sm:pr-8">
          <DialogTitle className="w-fit">{t("actions.edit_note")}</DialogTitle>
        </DialogHeader>
        <div className="flex h-[80vh] min-h-0 flex-col gap-3">
          <div className="flex shrink-0 flex-col gap-1.5">
            <Label htmlFor={titleId}>{t("preview.note_title_label")}</Label>
            <Input
              ref={titleRef}
              id={titleId}
              defaultValue={bookmark.title ?? ""}
              maxLength={MAX_BOOKMARK_TITLE_LENGTH}
              className="max-sm:h-11 [@media(pointer:coarse)]:h-11"
            />
          </div>
          <div className="min-h-0 flex-1">
            <MarkdownEditor
              onSave={save}
              onCancel={requestClose}
              isSaving={isSaving}
              onDraftChange={(draft) => {
                draftRef.current = draft;
              }}
            >
              {(bookmark as ZBookmarkTypeText).content.text}
            </MarkdownEditor>
          </div>
        </div>
        <Dialog open={isConfirmingClose} onOpenChange={setIsConfirmingClose}>
          <DialogContent
            hideCloseBtn
            className="max-w-md"
            onOpenAutoFocus={(e) => {
              // On the choice that loses nothing, should Enter follow.
              e.preventDefault();
              keepEditingRef.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("editor.unsaved_changes.title")}</DialogTitle>
              <DialogDescription>
                {t("editor.unsaved_changes.description")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-between">
              <Button variant="destructive" onClick={close}>
                {t("editor.unsaved_changes.discard")}
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  ref={keepEditingRef}
                  variant="outline"
                  onClick={() => setIsConfirmingClose(false)}
                >
                  {t("editor.unsaved_changes.keep_editing")}
                </Button>
                <ActionButton loading={isSaving} onClick={save}>
                  {t("actions.save")}
                </ActionButton>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
