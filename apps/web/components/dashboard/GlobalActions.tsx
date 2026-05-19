"use client";

import BulkBookmarksAction from "@/components/dashboard/BulkBookmarksAction";
import SortOrderToggle from "@/components/dashboard/SortOrderToggle";
import ViewOptions from "@/components/dashboard/ViewOptions";
import { useTranslation } from "@/lib/i18n/client";
import { useInBookmarkGridStore } from "@/lib/store/useInBookmarkGridStore";
import { useKeyboardNavigationStore } from "@/lib/store/useKeyboardNavigationStore";
import { Keyboard } from "lucide-react";

import { Button } from "../ui/button";

export default function GlobalActions() {
  const { t } = useTranslation();
  const inBookmarkGrid = useInBookmarkGridStore(
    (state) => state.inBookmarkGrid,
  );
  const setShortcutsDialogOpen = useKeyboardNavigationStore(
    (state) => state.setShortcutsDialogOpen,
  );
  return (
    <div className="flex min-w-max flex-wrap overflow-hidden">
      {inBookmarkGrid && <ViewOptions />}
      {inBookmarkGrid && <BulkBookmarksAction />}
      {inBookmarkGrid && <SortOrderToggle />}
      {inBookmarkGrid && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShortcutsDialogOpen(true)}
          title={t("keyboard_shortcuts.title")}
          aria-label={t("keyboard_shortcuts.title")}
        >
          <Keyboard className="size-4" />
        </Button>
      )}
    </div>
  );
}
