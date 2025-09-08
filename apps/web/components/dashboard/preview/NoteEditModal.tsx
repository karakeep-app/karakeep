"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { useClientConfig } from "@/lib/clientConfig";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";

export function NoteEditModal({
  bookmark,
  open,
  setOpen,
}: {
  bookmark: ZBookmark;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const demoMode = !!useClientConfig().demoMode;
  const [noteText, setNoteText] = useState(bookmark.note ?? "");

  const updateBookmarkMutator = useUpdateBookmark({
    onSuccess: () => {
      toast({
        description: "Note has been updated!",
      });
      setOpen(false);
    },
    onError: () => {
      toast({
        description: "Something went wrong while saving the note",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (noteText === bookmark.note) {
      setOpen(false);
      return;
    }
    updateBookmarkMutator.mutate({
      bookmarkId: bookmark.id,
      note: noteText,
    });
  };

  const handleCancel = () => {
    setNoteText(bookmark.note ?? "");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Note</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            className="min-h-[200px] w-full resize-none"
            placeholder="Write some notes ..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            disabled={demoMode || updateBookmarkMutator.isPending}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={demoMode || updateBookmarkMutator.isPending}
            >
              {updateBookmarkMutator.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}