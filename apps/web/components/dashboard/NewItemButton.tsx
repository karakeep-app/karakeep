"use client";

import { useEffect } from "react";
import EditorCard from "@/components/dashboard/bookmarks/EditorCard";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import { useKeyboardNavigationStore } from "@/lib/store/useKeyboardNavigationStore";
import { useNewItemTargetStore } from "@/lib/store/useNewItemTargetStore";
import { useBookmarkDisplaySettings } from "@/lib/userLocalSettings/bookmarksLayout";
import { getOS } from "@/lib/utils";
import { Plus } from "lucide-react";

import { BookmarkGridContextProvider } from "@karakeep/shared-react/hooks/bookmark-grid-context";

// Where the new item card goes when it isn't shown inline in the bookmark grid
export default function NewItemButton() {
  const { showNewItemCard } = useBookmarkDisplaySettings();
  const query = useNewItemTargetStore((state) => state.query);

  if (showNewItemCard || !query) {
    return null;
  }

  return (
    <BookmarkGridContextProvider query={query}>
      <NewItemDialog />
    </BookmarkGridContextProvider>
  );
}

function NewItemDialog() {
  const { t } = useTranslation();
  const open = useKeyboardNavigationStore((state) => state.newItemDialogOpen);
  const setOpen = useKeyboardNavigationStore(
    (state) => state.setNewItemDialogOpen,
  );

  // Don't leave the grid's shortcuts paused if the button goes away while the
  // dialog is open (e.g. navigating to a page without a grid).
  useEffect(() => () => setOpen(false), [setOpen]);

  const label = `${t("editor.new_item")} (${getOS() === "macos" ? "⌘" : "Ctrl"} + E)`;

  return (
    <>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            aria-label={t("editor.new_item")}
            onClick={() => setOpen(true)}
          >
            <Plus className="size-[18px]" size={18} />
          </Button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>{label}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <EditorCard dialog={{ open, onOpenChange: setOpen }} />
    </>
  );
}
