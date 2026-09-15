"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import {
  useIsInlineQuickAddPresent,
  useQuickAddStore,
} from "@/lib/store/useQuickAddStore";
import { Plus } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";

export default function FloatingAddButton() {
  const { t } = useTranslation();
  const openDialog = useQuickAddStore((s) => s.openDialog);
  const inlinePresent = useIsInlineQuickAddPresent();

  // Global ⌘E: on pages that already show the inline "New Item" card, that
  // card handles ⌘E itself (focuses its own textarea) - opening the dialog
  // on top of it too would be redundant. Only step in when there's no
  // inline editor on the current page.
  useHotkeys(
    "mod+e",
    () => {
      if (!inlinePresent) {
        openDialog();
      }
    },
    [inlinePresent, openDialog],
  );

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={openDialog}
          aria-label={t("editor.new_item")}
          className="fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:bg-primary/90 active:scale-95"
        >
          <Plus className="size-6" />
        </button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="left">{t("editor.new_item")}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
