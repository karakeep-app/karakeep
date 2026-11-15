"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";

const SLOT_ATTRIBUTE = "data-save-bar";

/**
 * Save and Discard for an edit form, floating over the page so that appearing
 * doesn't move anything. Render it inside the form, only while the form is dirty,
 * so Enter and tab order keep working. It takes the lowest free slot, for when a
 * second form on the page has unsaved changes too.
 */
export function SaveBar({
  saving,
  saveLabel,
  onDiscard,
}: {
  saving: boolean;
  saveLabel: string;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState(0);

  useLayoutEffect(() => {
    const taken = new Set(
      [...document.querySelectorAll(`[${SLOT_ATTRIBUTE}]`)]
        .filter((bar) => bar !== ref.current)
        .map((bar) => bar.getAttribute(SLOT_ATTRIBUTE)),
    );
    let free = 0;
    while (taken.has(String(free))) {
      free++;
    }
    setSlot(free);
  }, []);

  return (
    <div
      ref={ref}
      {...{ [SLOT_ATTRIBUTE]: slot }}
      role="group"
      aria-label={t("settings.unsaved_changes")}
      // Centred on the panel beside the sidebar, which is 15rem and then 18rem.
      className="fixed inset-x-4 z-40 flex items-center justify-between gap-3 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg duration-150 animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none sm:inset-x-auto sm:left-[calc(50%+7.5rem)] sm:w-[28rem] sm:-translate-x-1/2 sm:ps-4 xl:left-[calc(50%+9rem)]"
      style={{
        bottom: `calc(env(safe-area-inset-bottom) + 1rem + ${slot} * 4.25rem)`,
      }}
    >
      {/* There's only room for the buttons on a phone, and they're clear enough. */}
      <span className="min-w-0 truncate text-sm font-medium max-sm:hidden">
        {t("settings.unsaved_changes")}
      </span>
      <div className="flex shrink-0 items-center gap-2 max-sm:flex-1 max-sm:[&>*]:flex-1">
        <Button type="button" variant="ghost" onClick={onDiscard}>
          {t("settings.discard")}
        </Button>
        <ActionButton type="submit" loading={saving}>
          {saveLabel}
        </ActionButton>
      </div>
    </div>
  );
}
