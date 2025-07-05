import { useEffect, useRef, useState, FC, ComponentProps, PointerEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PopoverAnchor } from "@radix-ui/react-popover";
import { Check, Trash2 } from "lucide-react";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/cjs/styles/prism";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import {
  SUPPORTED_HIGHLIGHT_COLORS,
  ZHighlightColor,
} from "@karakeep/shared/types/highlights";

import { HIGHLIGHT_COLOR_MAP } from "./highlights";

interface ColorPickerMenuProps {
  position: { x: number; y: number } | null;
  onColorSelect: (color: ZHighlightColor) => void;
  onDelete?: () => void;
  selectedHighlight: TextHighlight | null;
  onClose: () => void;
  isMobile: boolean;
}

const ColorPickerMenu: FC<ColorPickerMenuProps> = ({
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

export interface TextHighlight {
  id: string;
  startOffset: number;
  endOffset: number;
  color: ZHighlightColor;
  text: string | null;
}

interface TextHighlighterProps {
  markdownContent: string;
  className?: string;
  highlights?: TextHighlight[];
  onHighlight?: (highlight: TextHighlight) => void;
  onUpdateHighlight?: (highlight: TextHighlight) => void;
  onDeleteHighlight?: (highlight: TextHighlight) => void;
}

function PreWithCopyBtn({ className, ...props }: ComponentProps<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  return (
    <span className="group relative">
      <pre ref={ref} className={cn(className, "")} {...props} />
    </span>
  );
}

function BookmarkTextHighlighter({
  markdownContent,
  className,
  highlights = [],
  onHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
}: TextHighlighterProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [pendingHighlight, setPendingHighlight] =
    useState<TextHighlight | null>(null);
  const [selectedHighlight, setSelectedHighlight] =
    useState<TextHighlight | null>(null);
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

    // Normalize whitespace to ensure consistent text offsets
    if (contentRef.current) {
      contentRef.current.normalize();
    }

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

  const handlePointerUp = (e: PointerEvent) => {
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
  ): TextHighlight | null => {
    if (!contentRef.current) return null;

    const startOffset =
      getTextNodeOffset(range.startContainer) + range.startOffset;
    const endOffset = getTextNodeOffset(range.endContainer) + range.endOffset;

    if (startOffset === -1 || endOffset === -1) return null;

    const highlight: TextHighlight = {
      id: "NOT_SET",
      startOffset,
      endOffset,
      color,
      text: range.toString(),
    };

    applyHighlightByOffset(highlight);
    return highlight;
  };

  const getRangeFromHighlight = (highlight: TextHighlight) => {
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

  const applyHighlightByOffset = (highlight: TextHighlight) => {
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
        onPointerUp={handlePointerUp}
        className={cn("prose dark:prose-invert", className)}
      >
        <Markdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          components={{
            pre({ ...props }) {
              return <PreWithCopyBtn {...props} />;
            },
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className ?? "");
              return match ? (
                // @ts-expect-error -- Refs are not compatible for some reason
                <SyntaxHighlighter
                  PreTag="div"
                  language={match[1]}
                  {...props}
                  style={dracula}
                >
                  {String(children).replace(/\n$/, "")}
                </SyntaxHighlighter>
              ) : (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {markdownContent}
        </Markdown>
      </div>
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

export default BookmarkTextHighlighter;
