import React, { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PopoverAnchor } from "@radix-ui/react-popover";
import { Check, Trash2 } from "lucide-react";

import {
  SUPPORTED_HIGHLIGHT_COLORS,
  ZHighlightColor,
} from "@karakeep/shared/types/highlights";

import { HIGHLIGHT_COLOR_MAP } from "./highlights";

interface ColorPickerMenuProps {
  position: { x: number; y: number } | null;
  onColorSelect: (color: ZHighlightColor) => void;
  onDelete?: () => void;
  selectedHighlight: Highlight | null;
  onClose: () => void;
  isMobile: boolean;
}

const ColorPickerMenu: React.FC<ColorPickerMenuProps> = ({
  position,
  onColorSelect,
  onDelete,
  selectedHighlight,
  onClose,
  isMobile,
}) => {
  return (
    <Popover
      open={position !== null}
      onOpenChange={(val) => {
        if (!val) {
          onClose();
        }
      }}
    >
      <PopoverAnchor
        className="fixed"
        style={{
          left: position?.x,
          top: position?.y,
        }}
      />
      <PopoverContent
        side={isMobile ? "bottom" : "top"}
        className="flex w-fit items-center gap-1 p-2"
      >
        {SUPPORTED_HIGHLIGHT_COLORS.map((color) => (
          <Button
            size="none"
            key={color}
            onClick={() => onColorSelect(color)}
            variant="none"
            className={cn(
              `size-8 rounded-full hover:border focus-visible:ring-0`,
              HIGHLIGHT_COLOR_MAP.bg[color],
            )}
          >
            {selectedHighlight?.color === color && (
              <Check className="size-5 text-gray-600" />
            )}
          </Button>
        ))}
        {selectedHighlight && (
          <ActionButton
            loading={false}
            size="none"
            className="size-8 rounded-full"
            onClick={onDelete}
            variant="ghost"
          >
            <Trash2 className="size-5 text-destructive" />
          </ActionButton>
        )}
      </PopoverContent>
    </Popover>
  );
};

export interface Highlight {
  id: string;
  startOffset: number;
  endOffset: number;
  color: ZHighlightColor;
  text: string | null;
}

interface HTMLHighlighterProps {
  htmlContent: string;
  style?: React.CSSProperties;
  className?: string;
  highlights?: Highlight[];
  onHighlight?: (highlight: Highlight) => void;
  onUpdateHighlight?: (highlight: Highlight) => void;
  onDeleteHighlight?: (highlight: Highlight) => void;
}

function BookmarkHTMLHighlighter({
  htmlContent,
  className,
  style,
  highlights = [],
  onHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
}: HTMLHighlighterProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<Highlight | null>(
    null,
  );
  const [selectedHighlight, setSelectedHighlight] = useState<Highlight | null>(
    null,
  );
  const isMobile = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches,
  )[0];

  // Apply existing highlights when component mounts or highlights change
  useEffect(() => {
    if (!contentRef.current) return;

    // Clear existing highlights first
    const existingHighlights = contentRef.current.querySelectorAll(
      "span[data-highlight]",
    );
    existingHighlights.forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el);
        }
        parent.removeChild(el);
      }
    });

    // Apply all highlights
    highlights.forEach((highlight) => {
      applyHighlightByOffset(highlight);
    });
  });

  // Re-apply the selection when the pending range changes
  useEffect(() => {
    if (!pendingHighlight) {
      return;
    }
    if (!contentRef.current) {
      return;
    }
    const ranges = getRangeFromHighlight(pendingHighlight);
    if (!ranges) {
      return;
    }
    const newRange = document.createRange();
    newRange.setStart(ranges[0].node, ranges[0].start);
    newRange.setEnd(
      ranges[ranges.length - 1].node,
      ranges[ranges.length - 1].end,
    );
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(newRange);
  }, [pendingHighlight, contentRef]);

  const handlePointerUp = (e: React.PointerEvent) => {
    const selection = window.getSelection();

    // Check if we clicked on an existing highlight
    const target = e.target as HTMLElement;
    if (target.dataset.highlight) {
      const highlightId = target.dataset.highlightId;
      if (highlightId && highlights) {
        const highlight = highlights.find((h) => h.id === highlightId);
        if (!highlight) {
          return;
        }
        setSelectedHighlight(highlight);
        setMenuPosition({
          x: e.clientX,
          y: e.clientY,
        });
        return;
      }
    }

    if (!selection || selection.isCollapsed || !contentRef.current) {
      return;
    }

    const range = selection.getRangeAt(0);

    // Only process selections within our component
    if (!contentRef.current.contains(range.commonAncestorContainer)) {
      return;
    }

    // Position the menu based on device type
    const rect = range.getBoundingClientRect();
    setMenuPosition({
      x: rect.left + rect.width / 2, // Center the menu horizontally
      y: isMobile ? rect.bottom : rect.top, // Position below on mobile, above otherwise
    });

    // Store the highlight for later use
    setPendingHighlight(createHighlightFromRange(range, "yellow"));
  };

  const handleColorSelect = (color: ZHighlightColor) => {
    if (pendingHighlight) {
      pendingHighlight.color = color;
      onHighlight?.(pendingHighlight);
    } else if (selectedHighlight) {
      selectedHighlight.color = color;
      onUpdateHighlight?.(selectedHighlight);
    }
    closeColorPicker();
  };

  const closeColorPicker = () => {
    setMenuPosition(null);
    setPendingHighlight(null);
    setSelectedHighlight(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleDelete = () => {
    if (selectedHighlight && onDeleteHighlight) {
      onDeleteHighlight(selectedHighlight);
      closeColorPicker();
    }
  };

  const getTextNodeOffset = (node: Node): number => {
    let offset = 0;
    const walker = document.createTreeWalker(
      contentRef.current!,
      NodeFilter.SHOW_TEXT,
      null,
    );

    while (walker.nextNode()) {
      if (walker.currentNode === node) {
        return offset;
      }
      offset += walker.currentNode.textContent?.length ?? 0;
    }
    return -1;
  };

  const createHighlightFromRange = (
    range: Range,
    color: ZHighlightColor,
  ): Highlight | null => {
    if (!contentRef.current) return null;

    const startOffset =
      getTextNodeOffset(range.startContainer) + range.startOffset;
    const endOffset = getTextNodeOffset(range.endContainer) + range.endOffset;

    if (startOffset === -1 || endOffset === -1) return null;

    const highlight: Highlight = {
      id: "NOT_SET",
      startOffset,
      endOffset,
      color,
      text: range.toString(),
    };

    applyHighlightByOffset(highlight);
    return highlight;
  };

  const getRangeFromHighlight = (highlight: Highlight) => {
    if (!contentRef.current) return;

    let currentOffset = 0;
    const walker = document.createTreeWalker(
      contentRef.current,
      NodeFilter.SHOW_TEXT,
      null,
    );

    const ranges: { node: Text; start: number; end: number }[] = [];

    // Find all text nodes that need highlighting
    let node: Text | null;
    while ((node = walker.nextNode() as Text)) {
      const nodeLength = node.length;
      const nodeStart = currentOffset;
      const nodeEnd = nodeStart + nodeLength;

      if (nodeStart < highlight.endOffset && nodeEnd > highlight.startOffset) {
        ranges.push({
          node,
          start: Math.max(0, highlight.startOffset - nodeStart),
          end: Math.min(nodeLength, highlight.endOffset - nodeStart),
        });
      }

      currentOffset += nodeLength;
    }
    return ranges;
  };

  const applyHighlightByOffset = (highlight: Highlight) => {
    const ranges = getRangeFromHighlight(highlight);
    if (!ranges) {
      return;
    }
    // Apply highlights to found ranges
    ranges.forEach(({ node, start, end }) => {
      if (start > 0) {
        node.splitText(start);
        node = node.nextSibling as Text;
        end -= start;
      }
      if (end < node.length) {
        node.splitText(end);
      }

      const span = document.createElement("span");
      span.classList.add(HIGHLIGHT_COLOR_MAP.bg[highlight.color]);
      span.classList.add("text-gray-600");
      span.dataset.highlight = "true";
      span.dataset.highlightId = highlight.id;
      node.parentNode?.insertBefore(span, node);
      span.appendChild(node);
    });
  };

  return (
    <div>
      <div
        role="presentation"
        ref={contentRef}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
        onPointerUp={handlePointerUp}
        className={className}
        style={style}
      />
      <ColorPickerMenu
        position={menuPosition}
        onColorSelect={handleColorSelect}
        onDelete={handleDelete}
        selectedHighlight={selectedHighlight}
        onClose={closeColorPicker}
        isMobile={isMobile}
      />
    </div>
  );
}

export default BookmarkHTMLHighlighter;
