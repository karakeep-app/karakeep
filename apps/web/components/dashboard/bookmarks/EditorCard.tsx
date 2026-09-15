"use client";

import { useEffect } from "react";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/lib/i18n/client";
import { useQuickAddStore } from "@/lib/store/useQuickAddStore";
import {
  useBookmarkLayout,
  useBookmarkLayoutSwitch,
} from "@/lib/userLocalSettings/bookmarksLayout";
import { cn } from "@/lib/utils";

import { QuickAddForm } from "./QuickAddForm";

export default function EditorCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const bookmarkLayout = useBookmarkLayout();
  const cardHeight = useBookmarkLayoutSwitch({
    grid: "h-96",
    masonry: "h-48",
    list: undefined,
    compact: undefined,
  });

  // Lets the global ⌘E shortcut (backing the floating add button on pages
  // without an inline editor) know it doesn't need to do anything on this
  // page - this card's own ⌘E handling (inside QuickAddForm) already
  // covers it.
  const registerInlinePresent = useQuickAddStore(
    (s) => s.registerInlinePresent,
  );
  const unregisterInlinePresent = useQuickAddStore(
    (s) => s.unregisterInlinePresent,
  );
  useEffect(() => {
    registerInlinePresent();
    return () => unregisterInlinePresent();
  }, [registerInlinePresent, unregisterInlinePresent]);

  return (
    <QuickAddForm
      className={cn(className, "rounded-xl bg-card p-4", cardHeight)}
      header={
        <>
          <div className="flex justify-between">
            <p className="text-sm">{t("editor.new_item")}</p>
            <Kbd>⌘ + E</Kbd>
          </div>
          <Separator />
        </>
      }
      autoResize={bookmarkLayout === "list"}
      allowManualResize={bookmarkLayout === "list"}
    />
  );
}
