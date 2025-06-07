import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { PopoverAnchor } from "@radix-ui/react-popover";
import { Check, ClipboardCopy, Trash2 } from "lucide-react";

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
  onCopy: () => void;
}

const ColorPickerMenu: React.FC<ColorPickerMenuProps> = ({
  position,
  onColorSelect,
  onDelete,
  selectedHighlight,
  onClose,
  isMobile,
  onCopy,
}) => {
  if (!position) {
    return null;
  }

  if (selectedHighlight) {
    const elements = document.querySelectorAll(
      `[data-highlight-id="${selectedHighlight.id}"]`,
    );
    if (elements.length === 0) {
      return;
    }

    elements.forEach((el) => {
      el.classList.add(
        HIGHLIGHT_COLOR_MAP.bg[selectedHighlight.color].dark,
        "transition-colors",
        "duration-1000",
      );
    });
  }

  return (
    <Popover
      open={!!position}
      onOpenChange={(open) => {
        if (!open) {
          const elements = document.querySelectorAll(
            `[data-highlight-id="${selectedHighlight?.id}"]`,
          );
          if (elements.length !== 0 && selectedHighlight) {
            elements.forEach((el) => {
              el.classList.remove(
                HIGHLIGHT_COLOR_MAP.bg[selectedHighlight?.color].dark,
              );
            });
          }
          onClose();
        }
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
        <div className="flex gap-2">
          {selectedHighlight && onCopy && (
            <ActionButton
              loading={false}
              size="none"
              title="Copy to clipboard"
              variant="ghost"
              className="size-8 rounded-full transition-all duration-200 hover:scale-105 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={onCopy}
            >
              <ClipboardCopy className="size-5" />
            </ActionButton>
          )}
        </div>
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
};

export interface Highlight {
  id: string;
  startOffset: number;
  endOffset: number;
  color: ZHighlightColor;
  text: string | null;
}

export interface HTMLHighlighterProps {
  htmlContent: string;
  className?: string;
  highlights?: Highlight[];
  onHighlight?: (highlightData: Omit<Highlight, "id">) => void;
  onUpdateHighlight?: (highlight: Highlight) => void;
  onDeleteHighlight?: (highlight: Highlight) => void;
}

function BookmarkHTMLHighlighter({
  htmlContent,
  className,
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
  const [pendingRange, setPendingRange] = useState<Range | null>(null);
  const [selectedHighlight, setSelectedHighlight] = useState<Highlight | null>(
    null,
  );
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    if (!selectedHighlight) {
      return;
    }

    const highlightSpan = document.querySelector(
      `span[data-highlight-id="${selectedHighlight.id}"]`,
    );
    if (!highlightSpan) {
      return;
    }

    const updatePosition = () => {
      const rect = highlightSpan.getBoundingClientRect();

      const isVisible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom >= 0 &&
        rect.top <= window.innerHeight &&
        rect.right >= 0 &&
        rect.left <= window.innerWidth;

      if (!isVisible) {
        return;
      }

      setMenuPosition({
        x: rect.left + rect.width / 2,
        y: isMobile ? rect.bottom + 8 : rect.top - 12,
      });
      /*
       fixme
       jumps to 0,0 sometimes when fab is not visible
       doesn't scroll when screen resizes
       doesn't scroll when is windowed??
       */
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [selectedHighlight, isMobile]);

  const getCharacterOffsetOfNode = useCallback(
    (node: Node, parentElement: HTMLElement): number => {
      let offset = 0;
      const walker = document.createTreeWalker(
        parentElement,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      );
      let currentWalkerNode;
      while ((currentWalkerNode = walker.nextNode())) {
        if (currentWalkerNode === node) {
          break; // Stop when node is reached.
        }
        if (currentWalkerNode.nodeType === Node.TEXT_NODE) {
          offset += currentWalkerNode.textContent?.length ?? 0;
        }
      }
      return offset;
    },
    [],
  );

  const getHighlightDataFromRange = useCallback(
    (range: Range): Omit<Highlight, "id" | "color"> | null => {
      if (!contentRef.current) {
        return null;
      }
      contentRef.current.normalize();

      const {
        startContainer,
        startOffset: startOffsetInContainer,
        endContainer,
        endOffset: endOffsetInContainer,
      } = range;

      const getGlobalCharOffsetFromPoint = (
        pointContainer: Node,
        pointOffsetInNode: number,
      ): number => {
        if (!contentRef.current) {
          return -1;
        }

        if (pointContainer.nodeType === Node.TEXT_NODE) {
          const offsetBeforeNode = getCharacterOffsetOfNode(
            pointContainer,
            contentRef.current,
          );
          return offsetBeforeNode + pointOffsetInNode;
        } else if (pointContainer.nodeType === Node.ELEMENT_NODE) {
          let referenceNodeForOffsetCalc: Node | null; // Node to calculate offset against
          let includeTextWithinReferenceNode = false;

          if (pointOffsetInNode < pointContainer.childNodes.length) {
            referenceNodeForOffsetCalc =
              pointContainer.childNodes[pointOffsetInNode];
          } else {
            referenceNodeForOffsetCalc = pointContainer;
            includeTextWithinReferenceNode = true;
          }

          if (!referenceNodeForOffsetCalc) {
            return -1;
          }

          let accumulatedOffset = getCharacterOffsetOfNode(
            referenceNodeForOffsetCalc,
            contentRef.current,
          );

          if (
            includeTextWithinReferenceNode &&
            referenceNodeForOffsetCalc.nodeType === Node.ELEMENT_NODE
          ) {
            const innerWalker = document.createTreeWalker(
              referenceNodeForOffsetCalc,
              NodeFilter.SHOW_TEXT,
            );
            let textNode;
            while ((textNode = innerWalker.nextNode())) {
              accumulatedOffset += textNode.textContent?.length ?? 0;
            }
          }
          return accumulatedOffset;
        }
        return -1; // Should not be reached for valid node types
      };

      const globalStartOffset = getGlobalCharOffsetFromPoint(
        startContainer,
        startOffsetInContainer,
      );
      const globalEndOffset = getGlobalCharOffsetFromPoint(
        endContainer,
        endOffsetInContainer,
      );

      if (
        globalStartOffset === -1 ||
        globalEndOffset === -1 ||
        globalStartOffset > globalEndOffset // Basic validation
      ) {
        return null;
      }

      let textContent = "";
      const fragment = range.cloneContents();
      const tempDiv = document.createElement("div");
      tempDiv.appendChild(fragment);

      const walkNodes = (node: Node, isFirstBlock = true) => {
        if (node.nodeType === Node.TEXT_NODE) {
          textContent += node.textContent ?? "";
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;
          const style = window.getComputedStyle(element);
          const isBlock =
            style.display === "block" ||
            element.nodeName === "P" ||
            element.nodeName === "DIV" ||
            element.nodeName === "LI" ||
            element.nodeName === "H1" ||
            element.nodeName === "H2" ||
            element.nodeName === "H3" ||
            element.nodeName === "H4" ||
            element.nodeName === "H5" ||
            element.nodeName === "H6" ||
            element.nodeName === "BLOCKQUOTE";

          if (
            isBlock &&
            !isFirstBlock &&
            textContent &&
            !textContent.endsWith("\n")
          ) {
            textContent += "\n"; // adding a newline before blocks
          }

          if (element.nodeName === "BR") {
            textContent += "\n";
          }

          let firstChildBlock = true;
          for (const child of Array.from(element.childNodes)) {
            walkNodes(child, firstChildBlock);
            if (firstChildBlock) firstChildBlock = false;
          }

          if (isBlock && !textContent.endsWith("\n")) {
            textContent += "\n"; // now add after blocks
          }
        }
      };

      walkNodes(tempDiv);

      if (!textContent.trim()) {
        // Ignore only whitespace
        return null;
      }

      return {
        startOffset: globalStartOffset,
        endOffset: globalEndOffset,
        text: textContent,
      };
    },
    [getCharacterOffsetOfNode],
  );

  const getTextNodeAtOffset_refined = useCallback(
    (
      parentElement: HTMLElement,
      globalOffset: number,
    ): { node: Text; offsetInNode: number } | null => {
      let accumulatedOffset = 0;
      const walker = document.createTreeWalker(
        parentElement,
        NodeFilter.SHOW_TEXT,
      );
      let currentNodeAsText: Text | null = null;
      let lastVisitedNode: Text | null = null;

      while (walker.nextNode()) {
        const nextNode = walker.currentNode as Text;
        if (!nextNode) {
          if (globalOffset === accumulatedOffset && lastVisitedNode) {
            return {
              node: lastVisitedNode,
              offsetInNode: lastVisitedNode.length,
            };
          }
          break;
        }
        lastVisitedNode = nextNode;
        currentNodeAsText = nextNode;
        const nodeLength = currentNodeAsText.textContent?.length ?? 0;
        if (
          globalOffset >= accumulatedOffset &&
          globalOffset <= accumulatedOffset + nodeLength
        ) {
          return {
            node: currentNodeAsText,
            offsetInNode: globalOffset - accumulatedOffset,
          };
        }
        accumulatedOffset += nodeLength;
      }
      if (globalOffset === accumulatedOffset && lastVisitedNode) {
        return {
          node: lastVisitedNode,
          offsetInNode: lastVisitedNode.length,
        };
      }
      return null; // Offset not found
    },
    [],
  );

  const applyHighlightByOffset = useCallback(
    (highlight: Highlight) => {
      if (
        !contentRef.current ||
        !highlight ||
        highlight.startOffset >= highlight.endOffset || // Invalid range
        !highlight.id // Highlight must have an ID
      ) {
        return;
      }
      // Normalize content to merge adjacent text nodes for consistent offset mapping.
      contentRef.current.normalize();

      const startPoint = getTextNodeAtOffset_refined(
        contentRef.current,
        highlight.startOffset,
      );
      const endPoint = getTextNodeAtOffset_refined(
        contentRef.current,
        highlight.endOffset,
      );

      if (!startPoint || !endPoint) {
        return;
      }

      const masterRange = document.createRange();
      try {
        if (
          startPoint.offsetInNode >
            (startPoint.node.textContent?.length ?? 0) ||
          endPoint.offsetInNode > (endPoint.node.textContent?.length ?? 0)
        ) {
          return;
        }
        masterRange.setStart(startPoint.node, startPoint.offsetInNode);
        masterRange.setEnd(endPoint.node, endPoint.offsetInNode);
      } catch (e) {
        return;
      }

      if (masterRange.collapsed && !masterRange.toString().trim()) {
        return;
      }

      const nodesToProcessDetails: {
        node: Text;
        startOffsetInNode: number;
        endOffsetInNode: number;
      }[] = [];
      const commonAncestor = masterRange.commonAncestorContainer;

      if (
        commonAncestor.nodeType === Node.TEXT_NODE &&
        masterRange.startContainer === commonAncestor &&
        masterRange.endContainer === commonAncestor
      ) {
        nodesToProcessDetails.push({
          node: commonAncestor as Text,
          startOffsetInNode: masterRange.startOffset,
          endOffsetInNode: masterRange.endOffset,
        });
      } else if (
        commonAncestor.nodeType === Node.ELEMENT_NODE ||
        commonAncestor.nodeType === Node.DOCUMENT_FRAGMENT_NODE
      ) {
        const walker = document.createTreeWalker(
          commonAncestor,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) =>
              masterRange.intersectsNode(node)
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT,
          },
        );
        let currentWalkerNode;
        while ((currentWalkerNode = walker.nextNode() as Text | null)) {
          const sOffset =
            currentWalkerNode === masterRange.startContainer
              ? masterRange.startOffset
              : 0;
          const eOffset =
            currentWalkerNode === masterRange.endContainer
              ? masterRange.endOffset
              : currentWalkerNode.length;

          if (sOffset < eOffset) {
            nodesToProcessDetails.push({
              node: currentWalkerNode,
              startOffsetInNode: sOffset,
              endOffsetInNode: eOffset,
            });
          }
        }
      } else {
        return;
      }

      for (let i = nodesToProcessDetails.length - 1; i >= 0; i--) {
        const { node, startOffsetInNode, endOffsetInNode } =
          nodesToProcessDetails[i];
        let nodeToWrap: Text = node;

        if (!nodeToWrap.parentNode || !document.body.contains(nodeToWrap))
          continue;

        try {
          // Split after highlight. nodeToQWrap is the first part
          if (endOffsetInNode < nodeToWrap.length) {
            nodeToWrap.splitText(endOffsetInNode);
          } // Splitting before highlight.
          if (startOffsetInNode > 0) {
            nodeToWrap = nodeToWrap.splitText(startOffsetInNode);
          }
        } catch (splitError) {
          continue;
        }

        if (nodeToWrap.nodeValue && nodeToWrap.nodeValue.trim().length > 0) {
          const span = document.createElement("span");
          span.className = cn(
            HIGHLIGHT_COLOR_MAP.bg[highlight.color].light,
            "text-gray-600",
            "whitespace-normal",
            "break-words",
          );
          span.dataset.highlight = "true";
          span.dataset.highlightId = highlight.id;

          if (nodeToWrap.parentNode) {
            nodeToWrap.parentNode.insertBefore(span, nodeToWrap);
            span.appendChild(nodeToWrap);
          }
        }
      }
    },
    [getTextNodeAtOffset_refined, HIGHLIGHT_COLOR_MAP],
  );

  useEffect(() => {
    if (!contentRef.current) {
      return;
    }
    contentRef.current.innerHTML = htmlContent || "";

    if (highlights && highlights.length > 0) {
      highlights.forEach((highlight) => {
        if (highlight && highlight.id) {
          applyHighlightByOffset(highlight);
        }
      });
    }
  }, [highlights, htmlContent, applyHighlightByOffset]);

  const processSelection = useCallback(
    (selection: Selection | null, clickX: number, clickY: number) => {
      if (!selection) {
        if (pendingRange) setPendingRange(null);
        return;
      }

      if (
        selection.rangeCount > 0 &&
        !selection.isCollapsed && // Selection must not be a collapsed caret
        contentRef.current // Must exist
      ) {
        const range = selection.getRangeAt(0);
        const commonAncestor = range.commonAncestorContainer;

        if (!commonAncestor) {
          if (pendingRange) setPendingRange(null);
          return;
        }

        const isContainedCheck =
          contentRef.current.contains(commonAncestor) ||
          contentRef.current === commonAncestor;

        if (isContainedCheck) {
          if (
            !contentRef.current.contains(range.startContainer) ||
            !contentRef.current.contains(range.endContainer)
          ) {
            if (pendingRange) setPendingRange(null);
            return;
          }

          const selectionText = range.toString().trim();
          if (!selectionText) {
            if (pendingRange) setPendingRange(null);
            return;
          }

          setPendingRange(range);
          setSelectedHighlight(null);

          const newMenuPos = {
            x: clickX,
            y: isMobile ? clickY + 8 : clickY - 12,
          };

          const rect = range.getBoundingClientRect();
          if (
            isNaN(newMenuPos.x) ||
            isNaN(newMenuPos.y) ||
            !isFinite(newMenuPos.x) ||
            !isFinite(newMenuPos.y) ||
            (rect.width === 0 && rect.height === 0 && selectionText.length > 0)
          ) {
            setPendingRange(null);
            return;
          }
          setMenuPosition(newMenuPos);
        } else {
          if (pendingRange) setPendingRange(null);
        }
      } else {
        if (pendingRange) setPendingRange(null);
      }
    },
    [isMobile, pendingRange],
  );

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.button !== 0) {
      if (pendingRange) setPendingRange(null);
      if (menuPosition && !selectedHighlight) {
        setMenuPosition(null);
      }
      return;
    }

    const target = e.target as HTMLElement;
    const highlightSpan = target.closest<HTMLElement>(
      "span[data-highlight='true']",
    );

    if (highlightSpan?.dataset.highlightId) {
      const highlightId = highlightSpan.dataset.highlightId;
      const foundHighlight = highlights.find((h) => h.id === highlightId);
      if (foundHighlight) {
        setSelectedHighlight(foundHighlight);
        setPendingRange(null);
        const clickPos = {
          x: e.clientX,
          y: isMobile ? e.clientY + 8 : e.clientY - 12,
        };
        setMenuPosition(clickPos);
        e.stopPropagation();
      }
      return;
    }

    setTimeout(() => {
      const selection = window.getSelection();
      processSelection(selection, e.clientX, e.clientY);
    }, 1); // Very small delay to wait for selection to update.
  };

  const closeColorPicker = useCallback(() => {
    setSelectedHighlight(null);
  }, []);

  const handleColorSelect = (color: ZHighlightColor) => {
    if (pendingRange && onHighlight) {
      const highlightData = getHighlightDataFromRange(pendingRange);
      if (highlightData) {
        onHighlight({ ...highlightData, color });
      }
    } else if (selectedHighlight && onUpdateHighlight) {
      onUpdateHighlight({ ...selectedHighlight, color });
    }
    setMenuPosition(null);
    setPendingRange(null);
    setSelectedHighlight(null);
  };

  const handleDelete = () => {
    if (selectedHighlight && onDeleteHighlight) {
      onDeleteHighlight(selectedHighlight);
    }
    setMenuPosition(null);
    setPendingRange(null);
    setSelectedHighlight(null);
  };

  const handleCopy = () => {
    if (!selectedHighlight) {
      toast({
        description: "You don't have a highlight selected",
      });
      return;
    }
    if (!navigator.clipboard) {
      toast({
        description: "Clipboard API not supported.", // todo add a faq thing?
      });
      return;
    }
    try {
      navigator.clipboard
        ?.writeText(selectedHighlight.text ?? "")
        .then(() => toast({ description: "Copied highlight to clipboard!" }));
    } catch (e) {
      toast({ description: "Could not copy text" });
    }
  };

  return (
    <div>
      <div
        role="presentation"
        ref={contentRef}
        className={className}
        onPointerUp={handlePointerUp}
        style={{
          userSelect: "text",
          WebkitUserSelect: "text",
          msUserSelect: "text",
        }}
      />
      {menuPosition && ( // Conditional render
        <ColorPickerMenu
          position={menuPosition}
          onColorSelect={handleColorSelect}
          selectedHighlight={selectedHighlight}
          onClose={() => {
            setMenuPosition(null);
            closeColorPicker();
            if (pendingRange) {
              setPendingRange(null);
            } else if (!selectedHighlight) {
              window.getSelection()?.removeAllRanges();
            }
          }}
          isMobile={isMobile}
          onDelete={
            selectedHighlight && onDeleteHighlight ? handleDelete : undefined
          }
          onCopy={handleCopy}
        />
      )}
    </div>
  );
}

export default BookmarkHTMLHighlighter;
