"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useTranslation } from "@/lib/i18n/client";
import { useBookmarkLayout } from "@/lib/userLocalSettings/bookmarksLayout";
import { getOS } from "@/lib/utils";

function ShortcutRow({
  keys,
  description,
}: {
  keys: string[];
  description: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{description}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-xs text-muted-foreground">/</span>}
            <Kbd>{key}</Kbd>
          </span>
        ))}
      </div>
    </div>
  );
}

function ShortcutSection({
  title,
  shortcuts,
}: {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <div className="divide-y divide-border">
        {shortcuts.map((shortcut, i) => (
          <ShortcutRow
            key={i}
            keys={shortcut.keys}
            description={shortcut.description}
          />
        ))}
      </div>
    </div>
  );
}

export default function KeyboardShortcutsDialog({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const layout = useBookmarkLayout();
  const hasHorizontalNavigation = layout !== "list" && layout !== "compact";
  const searchModifier = getOS() === "macos" ? "⌘" : "Ctrl";

  const sections = [
    {
      title: t("keyboard_shortcuts.sections.navigation"),
      shortcuts: [
        ...(hasHorizontalNavigation
          ? [
              {
                keys: ["h", "←"],
                description: t("keyboard_shortcuts.move_left"),
              },
            ]
          : []),
        {
          keys: ["j", "↓"],
          description: t("keyboard_shortcuts.move_down"),
        },
        {
          keys: ["k", "↑"],
          description: t("keyboard_shortcuts.move_up"),
        },
        ...(hasHorizontalNavigation
          ? [
              {
                keys: ["l", "→"],
                description: t("keyboard_shortcuts.move_right"),
              },
            ]
          : []),
        {
          keys: ["o", "Enter"],
          description: t("keyboard_shortcuts.open_bookmark"),
        },
        {
          keys: ["Esc"],
          description: t("keyboard_shortcuts.clear_focus"),
        },
      ],
    },
    {
      title: t("keyboard_shortcuts.sections.actions"),
      shortcuts: [
        {
          keys: ["f"],
          description: t("keyboard_shortcuts.toggle_favorite"),
        },
        {
          keys: ["a"],
          description: t("keyboard_shortcuts.toggle_archive"),
        },
        {
          keys: ["#"],
          description: t("keyboard_shortcuts.delete_bookmark"),
        },
      ],
    },
    {
      title: t("keyboard_shortcuts.sections.selection"),
      shortcuts: [
        {
          keys: ["x"],
          description: t("keyboard_shortcuts.toggle_selection"),
        },
        {
          keys: ["* a"],
          description: t("keyboard_shortcuts.select_all"),
        },
        {
          keys: ["* n"],
          description: t("keyboard_shortcuts.deselect_all"),
        },
      ],
    },
    {
      title: t("keyboard_shortcuts.sections.other"),
      shortcuts: [
        {
          keys: ["?"],
          description: t("keyboard_shortcuts.show_help"),
        },
        {
          keys: [`${searchModifier} K`],
          description: t("keyboard_shortcuts.focus_search_alt"),
        },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("keyboard_shortcuts.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {sections.map((section, i) => (
            <ShortcutSection
              key={i}
              title={section.title}
              shortcuts={section.shortcuts}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
