import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { PopoverAnchor } from "@radix-ui/react-popover";
import { Check, Trash2, X } from "lucide-react";

import {
  SUPPORTED_HIGHLIGHT_COLORS,
  ZHighlightColor,
} from "@karakeep/shared/types/highlights";
import {
  createHighlightResolver,
  getHighlightContext,
} from "@karakeep/shared/utils/highlight-anchoring";

import { HIGHLIGHT_COLOR_MAP } from "./highlights";
import { Button } from "./ui/button";
import { Popover, PopoverContent } from "./ui/popover";
import { Textarea } from "./ui/textarea";

interface HighlightFormProps {
  position: { x: number; y: number } | null;
  selectedHighlight: Highlight | null;
  onClose: () => void;
  onSave: (color: ZHighlightColor, note: string | null) => void;
  onDelete?: () => void;
  isMobile: boolean;
}

const HighlightForm: React.FC<HighlightFormProps> = ({
  position,
  selectedHighlight,
  onClose,
  onSave,
  onDelete,
  isMobile,
}) => {
  const [selectedColor, setSelectedColor] = useState<ZHighlightColor>(
    selectedHighlight?.color || "yellow",
  );
  const [noteText, setNoteText] = useState(selectedHighlight?.note || "");

  // Update state when selectedHighlight changes
  useEffect(() => {
    setSelectedColor(selectedHighlight?.color || "yellow");
    setNoteText(selectedHighlight?.note || "");
  }, [selectedHighlight]);

  const handleSave = () => {
    onSave(selectedColor, noteText || null);
  };

  // Anchor the popover to a virtual element in viewport coordinates. A DOM
  // anchor with `position: fixed` gets positioned relative to any transformed
  // ancestor instead of the viewport (e.g. the bookmark preview dialog), which
  // made the popover cover the selection.
  const anchorRef = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          new DOMRect(position?.x ?? 0, position?.y ?? 0, 0, 0),
      },
    }),
    [position],
  );

  return (
    <Popover
      open={position !== null}
      onOpenChange={(val) => {
        if (!val) {
          onClose();
        }
      }}
    >
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        side={isMobile ? "bottom" : "top"}
        className="w-80 space-y-3 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div>
          <label className="mb-2 block text-sm font-medium">Color</label>
          <div className="flex items-center gap-1">
            {SUPPORTED_HIGHLIGHT_COLORS.map((color) => (
              <Button
                size="none"
                key={color}
                onClick={() => setSelectedColor(color)}
                variant="none"
                className={cn(
                  `size-8 rounded-full hover:border focus-visible:ring-0`,
                  HIGHLIGHT_COLOR_MAP.swatch[color],
                )}
              >
                {selectedColor === color && (
                  <Check className="size-5 text-gray-900" />
                )}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">Note</label>
          <Textarea
            placeholder="Add a note (optional)..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="min-h-[80px] text-sm"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button onClick={handleSave} size="sm">
              Save
            </Button>
            <Button onClick={onClose} variant="outline" size="sm">
              Cancel
            </Button>
          </div>
          {selectedHighlight && onDelete && (
            <Button
              size="sm"
              onClick={onDelete}
              variant="ghost"
              title="Delete highlight"
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/**
 * A panel docked to the bottom of the screen, for touch browsers whose native
 * selection menu would otherwise sit on top of a popover next to the selection.
 * Choosing a colour saves straight away.
 */
const DOCK_HEIGHT = 150;
const SELECTION_SETTLE_MS = 250;

/** The dock's text, for apps that translate it. Missing entries fall back to English. */
export interface HighlightDockLabels {
  chooseColor: string;
  saved: string;
  colorGroup: string;
  colors: Record<ZHighlightColor, string>;
  deleteHighlight: string;
  saveNote: string;
  close: string;
  addNote: string;
}

const DEFAULT_DOCK_LABELS: HighlightDockLabels = {
  chooseColor: "Choose a color to save",
  saved: "Saved. Change the color or add a note.",
  colorGroup: "Highlight color. Choosing one saves the highlight.",
  colors: {
    yellow: "Highlight yellow",
    red: "Highlight red",
    green: "Highlight green",
    blue: "Highlight blue",
  },
  deleteHighlight: "Delete highlight",
  saveNote: "Save note",
  close: "Close",
  addNote: "Add a note",
};

const HighlightDock: React.FC<
  Omit<HighlightFormProps, "isMobile" | "position"> & {
    open: boolean;
    bottomOffset: number;
    onSaveNote?: (note: string | null) => void;
    labels?: Partial<HighlightDockLabels>;
    // The highlight is still being created: nothing can attach to it yet.
    saving?: boolean;
  }
> = ({
  open,
  bottomOffset,
  saving = false,
  labels: labelOverrides,
  selectedHighlight,
  onClose,
  onSave,
  onDelete,
  onSaveNote,
}) => {
  const [noteText, setNoteText] = useState(selectedHighlight?.note || "");
  const selectedColor = selectedHighlight?.color;
  const isExisting = !!onDelete;
  const isNoteDirty = noteText !== (selectedHighlight?.note || "");
  const scrollBeforeTyping = useRef<number | null>(null);
  const labels = { ...DEFAULT_DOCK_LABELS, ...labelOverrides };

  // A typed note is never thrown away: closing saves it, like every other edit.
  // The keyboard scrolls the page to make room; put the reader back.
  const restoreScroll = () => {
    if (scrollBeforeTyping.current !== null) {
      window.scrollTo({ top: scrollBeforeTyping.current });
      scrollBeforeTyping.current = null;
    }
  };

  const close = () => {
    // Closing unmounts the note field before it would report losing focus.
    restoreScroll();
    if (isNoteDirty && selectedHighlight) {
      onSave(selectedColor ?? "yellow", noteText || null);
    }
    onClose();
  };

  useEffect(() => {
    setNoteText(selectedHighlight?.note || "");
  }, [selectedHighlight]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed left-3 right-3 z-50 mx-auto max-w-md space-y-2 rounded-3xl bg-card p-3 text-card-foreground shadow-xl"
      style={{ bottom: bottomOffset }}
      // Keep taps here from clearing the selection they act on.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      // Tapping a control shouldn't first dismiss the keyboard and lose the tap.
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
        }
      }}
    >
      <p className="text-xs text-muted-foreground">
        {isExisting ? labels.saved : labels.chooseColor}
      </p>
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-2.5"
          role="group"
          aria-label={labels.colorGroup}
        >
          {SUPPORTED_HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={labels.colors[color] ?? `Highlight ${color}`}
              disabled={saving}
              onClick={() => onSave(color, noteText || null)}
              className={cn(
                "flex size-9 items-center justify-center rounded-full",
                HIGHLIGHT_COLOR_MAP.swatch[color],
              )}
            >
              {selectedHighlight && selectedColor === color && isExisting && (
                <Check className="size-5 text-gray-900" />
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {isExisting && (
            <button
              type="button"
              aria-label={labels.deleteHighlight}
              onClick={onDelete}
              className="flex size-9 items-center justify-center"
            >
              <Trash2 className="size-5 text-destructive" />
            </button>
          )}
          <button
            type="button"
            aria-label={isNoteDirty ? labels.saveNote : labels.close}
            onClick={close}
            className="flex size-9 items-center justify-center"
          >
            {isNoteDirty ? (
              <Check className="size-5 text-primary" />
            ) : (
              <X className="size-5" />
            )}
          </button>
        </div>
      </div>
      <Textarea
        placeholder={labels.addNote}
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        disabled={saving}
        rows={1}
        onFocus={() => {
          scrollBeforeTyping.current = window.scrollY;
        }}
        onBlur={() => {
          restoreScroll();
          // An edit to a saved highlight is kept as soon as typing stops, so
          // leaving the article can't lose it.
          if (isExisting && isNoteDirty) {
            onSaveNote?.(noteText || null);
          }
        }}
        className="min-h-9 resize-none rounded-xl border-0 bg-background text-sm shadow-none dark:bg-background"
      />
    </div>
  );
};

export interface Highlight {
  id: string;
  startOffset: number;
  endOffset: number;
  color: ZHighlightColor;
  text: string | null;
  prefix?: string | null;
  suffix?: string | null;
  note?: string | null;
}

interface HTMLHighlighterProps {
  htmlContent: string;
  style?: React.CSSProperties;
  className?: string;
  highlights?: Highlight[];
  readOnly?: boolean;
  onHighlight?: (highlight: Highlight) => void;
  onUpdateHighlight?: (highlight: Highlight) => void;
  onDeleteHighlight?: (highlight: Highlight) => void;
  /** Dock the highlight form to the bottom of the viewport, offset by this many px. */
  dockFormAt?: number;
  /** Translated text for the docked form. */
  dockLabels?: Partial<HighlightDockLabels>;
}

const BookmarkHTMLHighlighter = forwardRef<
  HTMLDivElement,
  HTMLHighlighterProps
>(function BookmarkHTMLHighlighter(
  {
    htmlContent,
    className,
    style,
    highlights = [],
    readOnly = false,
    onHighlight,
    onUpdateHighlight,
    onDeleteHighlight,
    dockFormAt,
    dockLabels,
  },
  ref,
) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Expose the content div ref to parent components
  useImperativeHandle(ref, () => contentRef.current!, []);

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
  const [justCreated, setJustCreated] = useState<Highlight | null>(null);
  // Once the new highlight comes back from the server, the dock edits it.
  useEffect(() => {
    if (!justCreated) {
      return;
    }
    const created = highlights.find(
      (h) =>
        h.startOffset === justCreated.startOffset &&
        h.endOffset === justCreated.endOffset,
    );
    if (created) {
      setSelectedHighlight(created);
      setJustCreated(null);
    }
  }, [highlights, justCreated]);
  const isMobile = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches,
  )[0];

  // Apply existing highlights when component mounts or highlights change
  // React rewrites innerHTML whenever this object's identity changes, which
  // would wipe the selection and the drawn highlights on every render.
  const stableHtml = useMemo(() => ({ __html: htmlContent }), [htmlContent]);
  const appliedHighlightsKey = useRef<string | null>(null);
  useEffect(() => {
    if (!contentRef.current) return;

    // Rebuilding the spans disturbs the live selection. The popover needs it on
    // every render to clear its preview, but the dock has no preview, so it only
    // rebuilds when something it would draw has changed.
    if (dockFormAt !== undefined) {
      const key = JSON.stringify([
        htmlContent.length,
        highlights.map((h) => [h.id, h.color, h.startOffset, h.endOffset]),
      ]);
      if (appliedHighlightsKey.current === key) {
        return;
      }
      appliedHighlightsKey.current = key;
    }

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

    // Offsets are only a hint: relocate each highlight using its stored
    // quote and context so that content changes don't misplace it.
    const resolveRange = createHighlightResolver(getFullText());
    highlights.forEach((highlight) => {
      const range = resolveRange(highlight);
      if (!range) {
        return;
      }
      applyHighlightByOffset({ ...highlight, ...range });
    });
  });

  // Re-apply the selection when the pending range changes
  useEffect(() => {
    // The dock doesn't touch the page while selecting, so the selection is still
    // intact. Setting it again would dismiss the system's Copy menu on Android.
    if (!pendingHighlight || dockFormAt !== undefined) {
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

  // Android cancels the touch once a long press starts selecting, so pointerup
  // never fires there. Selection changes work on every platform, and also follow
  // the user dragging the selection handles.
  const pendingRef = useRef(pendingHighlight);
  pendingRef.current = pendingHighlight;
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;
  const closeFormRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (dockFormAt === undefined || readOnly) {
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const handleSelectionChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || !contentRef.current) {
          return;
        }
        if (selection.isCollapsed) {
          // Focusing the note field moves the selection, but isn't a cancel.
          if (
            pendingRef.current &&
            document.activeElement?.tagName !== "TEXTAREA"
          ) {
            closeFormRef.current();
          }
          return;
        }
        const range = selection.getRangeAt(0);
        if (!contentRef.current.contains(range.commonAncestorContainer)) {
          return;
        }
        // Selecting text that's already highlighted edits that highlight,
        // rather than offering to create a second one on top of it.
        const ancestor = range.commonAncestorContainer;
        const existingId = (
          ancestor instanceof Element ? ancestor : ancestor.parentElement
        )?.closest<HTMLElement>("[data-highlight]")?.dataset.highlightId;
        const existing = highlightsRef.current.find((h) => h.id === existingId);
        if (existing) {
          setPendingHighlight(null);
          setSelectedHighlight(existing);
          setMenuPosition({ x: 0, y: 0 });
          return;
        }
        const startOffset =
          getTextNodeOffset(range.startContainer) + range.startOffset;
        const endOffset =
          getTextNodeOffset(range.endContainer) + range.endOffset;
        const current = pendingRef.current;
        if (
          current?.startOffset === startOffset &&
          current.endOffset === endOffset
        ) {
          return;
        }
        // The dock mustn't sit on top of the text it's acting on.
        if (!current) {
          const clearance = dockFormAt + DOCK_HEIGHT;
          const overlap =
            range.getBoundingClientRect().bottom -
            (window.innerHeight - clearance);
          if (overlap > 0) {
            window.scrollBy({ top: overlap, behavior: "smooth" });
          }
        }
        setSelectedHighlight(null);
        setPendingHighlight({
          id: "NOT_SET",
          startOffset,
          endOffset,
          color: "yellow",
          text: range.toString(),
        });
        setMenuPosition({ x: 0, y: 0 });
      }, SELECTION_SETTLE_MS);
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [dockFormAt, readOnly]);

  const handlePointerUp = (e: React.PointerEvent) => {
    if (readOnly) {
      return;
    }

    const selection = window.getSelection();

    // Check if we clicked on an existing highlight
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-highlight]",
    );
    if (target) {
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

    // The dock follows the selection itself: see the selectionchange effect.
    if (dockFormAt !== undefined) {
      // A tap on the page dismisses a saved highlight's dock. While a note is
      // being typed it only dismisses the keyboard, which saves the note.
      if (
        selectedHighlight &&
        selection?.isCollapsed &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        closeForm();
      }
      return;
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

  const handleSave = (color: ZHighlightColor, note: string | null) => {
    // The dock stays open after a colour tap, so a note can still follow it.
    // Wait for the new highlight to come back before changing it.
    if (
      dockFormAt !== undefined &&
      justCreated &&
      !pendingHighlight &&
      !selectedHighlight
    ) {
      return;
    }
    if (dockFormAt !== undefined && pendingHighlight) {
      pendingHighlight.color = color;
      pendingHighlight.note = note;
      onHighlight?.(pendingHighlight);
      setJustCreated(pendingHighlight);
      setPendingHighlight(null);
      window.getSelection()?.removeAllRanges();
      return;
    }
    if (dockFormAt !== undefined && selectedHighlight) {
      const updated = { ...selectedHighlight, color, note };
      setSelectedHighlight(updated);
      onUpdateHighlight?.(updated);
      return;
    }
    if (pendingHighlight) {
      pendingHighlight.color = color;
      pendingHighlight.note = note;
      onHighlight?.(pendingHighlight);
    } else if (selectedHighlight) {
      selectedHighlight.color = color;
      selectedHighlight.note = note;
      onUpdateHighlight?.(selectedHighlight);
    }
    closeForm();
  };

  const closeForm = () => {
    setMenuPosition(null);
    setJustCreated(null);
    setPendingHighlight(null);
    setSelectedHighlight(null);
    window.getSelection()?.removeAllRanges();
  };

  closeFormRef.current = closeForm;

  const handleDelete = () => {
    if (selectedHighlight && onDeleteHighlight) {
      onDeleteHighlight(selectedHighlight);
      closeForm();
    }
  };

  const getFullText = (): string => {
    if (!contentRef.current) return "";
    let text = "";
    const walker = document.createTreeWalker(
      contentRef.current,
      NodeFilter.SHOW_TEXT,
      null,
    );
    while (walker.nextNode()) {
      text += walker.currentNode.textContent ?? "";
    }
    return text;
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

    const { prefix, suffix } = getHighlightContext(
      getFullText(),
      startOffset,
      endOffset,
    );

    const highlight: Highlight = {
      id: "NOT_SET",
      startOffset,
      endOffset,
      color,
      text: range.toString(),
      prefix,
      suffix,
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
      span.classList.add(...HIGHLIGHT_COLOR_MAP.bg[highlight.color].split(" "));
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
        dangerouslySetInnerHTML={
          dockFormAt !== undefined ? stableHtml : { __html: htmlContent }
        }
        onPointerUp={handlePointerUp}
        className={cn(
          "prose prose-neutral max-w-none break-words dark:prose-invert [&_code]:break-all [&_img]:h-auto [&_img]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:overflow-x-auto",
          className,
        )}
        style={style}
      />
      {dockFormAt !== undefined ? (
        <HighlightDock
          open={menuPosition !== null}
          bottomOffset={dockFormAt}
          labels={dockLabels}
          saving={!selectedHighlight && !pendingHighlight && !!justCreated}
          selectedHighlight={
            selectedHighlight || pendingHighlight || justCreated
          }
          onClose={closeForm}
          onSave={handleSave}
          onDelete={selectedHighlight ? handleDelete : undefined}
          onSaveNote={(note) => {
            if (selectedHighlight) {
              const updated = { ...selectedHighlight, note };
              setSelectedHighlight(updated);
              onUpdateHighlight?.(updated);
            }
          }}
        />
      ) : (
        <HighlightForm
          position={menuPosition}
          selectedHighlight={selectedHighlight || pendingHighlight}
          onClose={closeForm}
          onSave={handleSave}
          onDelete={selectedHighlight ? handleDelete : undefined}
          isMobile={isMobile}
        />
      )}
    </div>
  );
});

export default BookmarkHTMLHighlighter;
