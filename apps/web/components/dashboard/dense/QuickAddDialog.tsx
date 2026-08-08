"use client";

import EditorCard from "@/components/dashboard/bookmarks/EditorCard";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useHotkeys } from "react-hotkeys-hook";

/**
 * The design's brand-row / header "add" icon. Reuses the existing quick-add
 * form (paste a link, drop a note, ⌘Enter to save) in a modal instead of
 * building a new create-bookmark flow from scratch.
 */
export function QuickAddDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // EditorCard's own "mod+e" hotkey only focuses an already-mounted
  // textarea — fine pre-fork, where the card sits inline on the page, but
  // here it exists only inside DialogContent, which Radix doesn't mount
  // until `open` is true. Nothing was listening for ⌘E until the dialog
  // was already open some other way, so the shortcut the dialog itself
  // advertises ("⌘ + E") did nothing. This component, unlike its dialog
  // content, is always mounted by its caller, so the hotkey lives here.
  //
  // Assumes a single QuickAddDialog mount in the tree at a time — DenseFilesView
  // is currently the only caller. If a second one is ever added, this hotkey
  // needs to be scoped again or it will open both at once.
  useHotkeys("mod+e", (e) => {
    e.preventDefault();
    onOpenChange(true);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-k-border bg-k-surface-1 text-k-fg sm:max-w-lg">
        <DialogTitle className="sr-only">Add bookmark</DialogTitle>
        <EditorCard dense onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
