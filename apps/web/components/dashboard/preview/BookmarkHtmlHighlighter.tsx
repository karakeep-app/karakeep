import React, { useCallback, useEffect, useRef, useState } from "react";
import { ColorPickerMenu } from "@/components/dashboard/preview/ColorPickerMenu";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

import { ZHighlightColor } from "@karakeep/shared/types/highlights";

import { HIGHLIGHT_COLOR_MAP } from "./highlights";
import {
  getFirstVisibleHighlight,
  getHighlightFromRange,
  Highlight,
  isElementVisible,
  isSelectionValid,
} from "./highlightUtils";

export interface HTMLHighlighterProps {
  htmlContent: string;
  style?: React.CSSProperties;
  className?: string;
  highlights?: Highlight[];
  onHighlight?: (highlightData: Omit<Highlight, "id">) => void;
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
  const [pendingRange, setPendingRange] = useState<Range | null>(null);
  const [selectedHighlight, setSelectedHighlight] = useState<Highlight | null>(
    null,
  );
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const calculateMenuPosition = (rect: DOMRect, isMobile: boolean) => ({
    x: rect.left + rect.width / 2,
    y: isMobile ? rect.bottom + 8 : rect.top - 12,
  });

  useEffect(() => {
    if ((!pendingRange || !menuPosition) && !selectedHighlight) return;

    let animationFrameId: number | null = null;
    let lastKnownY = 0;
    let lastKnownX = 0;
    let currentPos = menuPosition ? { ...menuPosition } : { x: 0, y: 0 };

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    let lastUpdateTime = 0;
    const updatePosition = () => {
      const now = performance.now();
      const deltaTime = now - lastUpdateTime;
      if (deltaTime < 8.33) return; // 1000 ms / 120 fps
      lastUpdateTime = now;

      let targetElement: HTMLElement | Range | null = null;

      if (selectedHighlight) {
        targetElement = getFirstVisibleHighlight(selectedHighlight.id);
      }

      if (!targetElement && pendingRange) {
        try {
          const rect = pendingRange.getBoundingClientRect();
          if (isElementVisible(rect)) {
            targetElement = pendingRange;
          }
        } catch {
          /* empty */
        }
      }

      if (!targetElement) {
        animationFrameId = requestAnimationFrame(updatePosition);
        return;
      }

      const rect = targetElement.getBoundingClientRect();
      const targetPos = calculateMenuPosition(rect, isMobile);

      currentPos.x = lerp(currentPos.x, targetPos.x, 0.5);
      currentPos.y = lerp(currentPos.y, targetPos.y, 0.5);

      if (
        Math.abs(currentPos.x - lastKnownX) > 1 ||
        Math.abs(currentPos.y - lastKnownY) > 1
      ) {
        setMenuPosition({ x: currentPos.x, y: currentPos.y });
        lastKnownX = currentPos.x;
        lastKnownY = currentPos.y;
      }
      animationFrameId = requestAnimationFrame(updatePosition);
    };

    animationFrameId = requestAnimationFrame(updatePosition);

    const handleViewportChange = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(updatePosition);
    };

    window.addEventListener("resize", handleViewportChange); // handle resize for mobile
    window.addEventListener("scroll", handleViewportChange, true); // handle scroll for desktop
    document.addEventListener("scroll", handleViewportChange, true); // handle coarser scroll for mobile

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportChange);
      window.visualViewport.addEventListener("scroll", handleViewportChange);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      document.removeEventListener("scroll", handleViewportChange, true);

      if (window.visualViewport) {
        window.visualViewport.removeEventListener(
          "resize",
          handleViewportChange,
        );
        window.visualViewport.removeEventListener(
          "scroll",
          handleViewportChange,
        );
      }
    };
  }, [pendingRange, selectedHighlight, isMobile]);

  const getTextNodeAtOffset = useCallback(
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
        // go through all the nodes sequentially
        const nextNode = walker.currentNode as Text;
        if (!nextNode) {
          if (globalOffset === accumulatedOffset && lastVisitedNode) {
            // get the offset of the last node
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
      return null; // nothing found
    },
    [],
  );

  const applyHighlightByOffset = useCallback(
    (highlight: Highlight) => {
      if (
        !contentRef.current ||
        !highlight ||
        !highlight.id ||
        highlight.startOffset >= highlight.endOffset
      ) {
        return;
      }
      contentRef.current.normalize(); // normalizing makes it so nodes are merged which make sure offsets are correct

      const startPoint = getTextNodeAtOffset(
        contentRef.current,
        highlight.startOffset,
      );
      const endPoint = getTextNodeAtOffset(
        contentRef.current,
        highlight.endOffset,
      );

      if (!startPoint || !endPoint) {
        return;
      }

      const masterRange = document.createRange();
      try {
        if (
          // make sure offsets are within the text node bounds
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
        // if it's a single text node
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
        // if it's a range that spans multiple texts
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
          const startOffset =
            currentWalkerNode === masterRange.startContainer // if the node is the start container, use range
              ? masterRange.startOffset // else use 0 (as we're in the center of the node)
              : 0;
          const endOffset =
            currentWalkerNode === masterRange.endContainer
              ? masterRange.endOffset
              : currentWalkerNode.length;

          if (startOffset < endOffset) {
            nodesToProcessDetails.push({
              node: currentWalkerNode,
              startOffsetInNode: startOffset,
              endOffsetInNode: endOffset,
            });
          }
        }
      } else {
        return;
      }

      // intentionally reverse the order to avoid issues with DOM manipulation
      for (let i = nodesToProcessDetails.length - 1; i >= 0; i--) {
        const { node, startOffsetInNode, endOffsetInNode } =
          nodesToProcessDetails[i];
        let nodeToWrap: Text = node;

        if (!nodeToWrap.parentNode || !document.body.contains(nodeToWrap))
          continue;

        try {
          if (endOffsetInNode < nodeToWrap.length) {
            nodeToWrap.splitText(endOffsetInNode);
          }
          if (startOffsetInNode > 0) {
            nodeToWrap = nodeToWrap.splitText(startOffsetInNode);
          }
        } catch (splitError) {
          continue;
        }

        if (nodeToWrap.nodeValue && nodeToWrap.nodeValue.trim().length > 0) {
          const span = document.createElement("span");
          span.className = cn(
            // finally apply the highlight styles
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

      const images = masterRange.cloneContents().querySelectorAll("img");
      images.forEach((img) => {
        const src = img.getAttribute("src");
        if (!src) return;
        const realImg = contentRef.current?.querySelector(
          `img[src="${CSS.escape(src)}"]`,
        ) as HTMLImageElement | null;
        if (realImg) {
          realImg.style.filter = HIGHLIGHT_COLOR_MAP.img[highlight.color];

          realImg.dataset.highlightId = highlight.id;
        }
      });
    },
    [getTextNodeAtOffset, HIGHLIGHT_COLOR_MAP],
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
    (selection: Selection | null, x: number, y: number) => {
      if (!selection || selection.isCollapsed || !contentRef.current) {
        setPendingRange(null);
        return;
      }

      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const isSelectionInContent = isSelectionValid(
          range,
          contentRef.current,
        );

        if (isSelectionInContent && range.toString().trim()) {
          setPendingRange(range);
          setSelectedHighlight(null);
          setMenuPosition({
            x,
            y: isMobile ? y + 8 : y - 12,
          });
        } else {
          setPendingRange(null);
        }
      }
    },
    [isMobile, setMenuPosition],
  );

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.button !== 0) {
      // left clicks only
      setPendingRange(null);
      if (menuPosition && !selectedHighlight) setMenuPosition(null);
      return;
    }

    const target = e.target as HTMLElement;
    const highlightElement = target.closest<HTMLElement>(
      'span[data-highlight="true"], img[data-highlight-id]',
    );

    if (highlightElement?.dataset.highlightId) {
      // if clicked on a highlight
      const highlightId = highlightElement.dataset.highlightId;
      const foundHighlight = highlights.find((h) => h.id === highlightId);

      if (foundHighlight) {
        setSelectedHighlight(foundHighlight);
        setPendingRange(null);
        setMenuPosition({
          x: e.clientX,
          y: isMobile ? e.clientY + 8 : e.clientY - 12,
        });
        e.stopPropagation();
      }
      return;
    }

    // small delay to avoid issues with text selection
    setTimeout(() => {
      processSelection(window.getSelection(), e.clientX, e.clientY);
    }, 1);
  };

  const closeMenu = () => {
    setMenuPosition(null);
    setPendingRange(null);
    setSelectedHighlight(null);
  };

  const handleColorSelect = (color: ZHighlightColor) => {
    if (pendingRange && onHighlight && contentRef.current) {
      const highlightData = getHighlightFromRange(
        pendingRange,
        contentRef.current,
      );
      if (highlightData) {
        onHighlight({ ...highlightData, color });
      }
    } else if (selectedHighlight && onUpdateHighlight) {
      onUpdateHighlight({ ...selectedHighlight, color });
    }

    closeMenu();
  };

  const handleDelete = () => {
    if (selectedHighlight && onDeleteHighlight) {
      onDeleteHighlight(selectedHighlight);
    }
    closeMenu();
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

      {menuPosition && ( // render only if menuPosition is set
        <ColorPickerMenu
          position={menuPosition}
          onColorSelect={handleColorSelect}
          selectedHighlight={selectedHighlight}
          onClose={() => {
            closeMenu();
            if (!selectedHighlight) {
              window.getSelection()?.removeAllRanges();
            }
          }}
          isMobile={isMobile}
          onDelete={
            selectedHighlight && onDeleteHighlight ? handleDelete : undefined
          }
          onCopy={() => {
            return selectedHighlight?.text || "";
          }}
        />
      )}
    </div>
  );
}

export default BookmarkHTMLHighlighter;
