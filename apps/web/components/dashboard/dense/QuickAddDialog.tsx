"use client";

import EditorCard from "@/components/dashboard/bookmarks/EditorCard";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * The design's brand-row / header "add" icon. Reuses the existing quick-add
 * form (paste a link, drop a note, ⌘E / ⌘Enter shortcuts all still work) in
 * a modal instead of building a new create-bookmark flow from scratch.
 */
export function QuickAddDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-k-border bg-k-surface-1 text-k-fg sm:max-w-lg">
        <DialogTitle className="sr-only">Add bookmark</DialogTitle>
        <EditorCard />
      </DialogContent>
    </Dialog>
  );
}
