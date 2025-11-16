import { useEffect } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import CopyBtn from "@/components/ui/copy-button";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PopoverAnchor } from "@radix-ui/react-popover";
import { Check, ClipboardCopy, Trash2 } from "lucide-react";

import {
  SUPPORTED_HIGHLIGHT_COLORS,
  ZHighlightColor,
} from "@karakeep/shared/types/highlights";

import { HIGHLIGHT_COLOR_MAP } from "../preview/highlights";
import { Highlight } from "./highlightUtils";

interface ColorPickerMenuProps {
  position: { x: number; y: number } | null;
  onColorSelect: (color: ZHighlightColor) => void;
  onDelete?: () => void;
  selectedHighlight: Highlight | null;
  onClose: () => void;
  isMobile: boolean;
  onCopy: () => string;
}

export function ColorPickerMenu({
  position,
  onColorSelect,
  onDelete,
  selectedHighlight,
  onClose,
  isMobile,
  onCopy,
}: ColorPickerMenuProps) {
  if (!position) return null;

  // Highlight the selected elements
  useEffect(() => {
    if (!selectedHighlight) return;

    const elements = document.querySelectorAll(
      `[data-highlight-id="${selectedHighlight.id}"]`,
    );

    elements.forEach((el) => {
      el.classList.add(
        HIGHLIGHT_COLOR_MAP.bg[selectedHighlight.color].dark,
        "transition-colors",
        "duration-1000",
      );
    });

    return () => {
      elements.forEach((el) => {
        el.classList.remove(
          HIGHLIGHT_COLOR_MAP.bg[selectedHighlight.color].dark,
        );
      });
    };
  }, [selectedHighlight]);

  return (
    <Popover
      open={!!position}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <PopoverAnchor
        className="fixed"
        style={{
          left: position.x,
          top: position.y,
          transform: isMobile
            ? "translate(-50%, 15px)"
            : "translate(-50%, -100%) translateY(-15px)",
        }}
      />
      <PopoverContent
        side={isMobile ? "bottom" : "top"}
        align="center"
        className="flex w-fit items-center gap-1 rounded-lg bg-white p-2 shadow-xl dark:bg-gray-800"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {selectedHighlight && (
          <CopyBtn
            className="size-8 rounded-full transition-all duration-200 hover:scale-105 hover:bg-gray-100 dark:hover:bg-gray-700"
            getStringToCopy={onCopy}
          ></CopyBtn>
        )}

        {SUPPORTED_HIGHLIGHT_COLORS.map((color) => (
          <Button
            key={color}
            size="none"
            variant="none"
            title={`Highlight ${color}`}
            className={cn(
              "relative size-8 rounded-full transition-all duration-200 ease-in-out hover:ring-2 hover:ring-gray-400 hover:ring-offset-1 focus-visible:ring-0 focus-visible:ring-gray-500 focus-visible:ring-offset-2",
              HIGHLIGHT_COLOR_MAP.bg[color].light,
            )}
            onClick={() => onColorSelect(color)}
          >
            {selectedHighlight?.color === color && (
              <Check className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 text-black drop-shadow-sm" />
            )}
          </Button>
        ))}

        {selectedHighlight && onDelete && (
          <ActionButton
            loading={false}
            size="none"
            title="Delete highlight"
            variant="ghost"
            className="size-8 rounded-full transition-all duration-200 hover:scale-105 hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={onDelete}
          >
            <Trash2 className="size-5 text-destructive" />
          </ActionButton>
        )}
      </PopoverContent>
    </Popover>
  );
}
