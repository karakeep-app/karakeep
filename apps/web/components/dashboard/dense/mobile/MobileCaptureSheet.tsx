"use client";

import { useEffect, useRef, useState } from "react";
import { BookmarkListSelector } from "@/components/dashboard/lists/BookmarkListSelector";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { gsap } from "gsap";
import { Sparkles, X } from "lucide-react";

import {
  useCreateBookmarkWithPostHook,
  useDeleteBookmark,
  useSummarizeBookmark,
  useUpdateBookmarkTags,
} from "@karakeep/shared-react/hooks/bookmarks";
import { useAddBookmarkToList } from "@karakeep/shared-react/hooks/lists";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { TagsEditor } from "../../bookmarks/TagsEditor";

/**
 * The mobile shell's capture surface — a bottom sheet, not the desktop
 * `QuickAddDialog`'s centred modal, matching the design's `capture()`
 * screen (design/Keepsake Mobile Designs.html, screen 2a).
 *
 * The design shows +list/+tag/summarise_now chips *before* Save, and its
 * own note is explicit about why: "title and summary fetch after the
 * sheet is gone, so the save never waits on the network." Karakeep's data
 * model has no way to attach tags or lists at creation time though — they
 * need an existing bookmark id — so tapping a chip here doesn't attach
 * anything yet. It stages a local selection (via `TagsEditor` and
 * `BookmarkListSelector`, both fully controlled components that don't
 * require a bookmark to exist), and Save fires the create call and then
 * the attach/list/summarise calls back to back, fire-and-forget, after
 * the sheet has already closed. One tap, and everything after it happens
 * off-screen — the same principle the design describes, extended to cover
 * tags and lists too since the create-tags-in-one-call shortcut the
 * design implies doesn't exist.
 */
export function MobileCaptureSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mounted, setMounted] = useState(open);
  const [toastVisible, setToastVisible] = useState(false);
  const [text, setText] = useState("");
  const [stagedTags, setStagedTags] = useState<
    { id: string; name: string; attachedBy: "human" | "ai" }[]
  >([]);
  const [stagedListIds, setStagedListIds] = useState<string[]>([]);
  const [summariseNow, setSummariseNow] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Set in createBookmark's onSuccess; read by the toast's UNDO button,
  // which fires after this component's own form state has already reset
  // for the next capture.
  const lastCreatedIdRef = useRef<string | null>(null);

  const { mutate: createBookmark, isPending: isCreating } =
    useCreateBookmarkWithPostHook();
  const { mutate: updateTags } = useUpdateBookmarkTags();
  const { mutate: addToList } = useAddBookmarkToList();
  const { mutate: summarise } = useSummarizeBookmark();
  const { mutate: deleteBookmark } = useDeleteBookmark();

  function resetForm() {
    setText("");
    setStagedTags([]);
    setStagedListIds([]);
    setSummariseNow(false);
  }

  // Mount as soon as `open` flips true; entrance animation runs once the
  // sheet is actually in the DOM (the effect below, keyed on `mounted`).
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!open || !mounted || !sheetRef.current) return;
    const tl = gsap.timeline();
    tl.from(sheetRef.current, {
      yPercent: 100,
      duration: 0.75,
      ease: "expo.out",
      delay: 0.05,
    });
    if (contentRef.current) {
      tl.from(
        Array.from(contentRef.current.children),
        {
          y: 14,
          opacity: 0,
          duration: 0.5,
          stagger: 0.045,
          ease: "power3.out",
        },
        "-=.5",
      );
    }
    const focusTimer = setTimeout(() => textareaRef.current?.focus(), 300);
    return () => clearTimeout(focusTimer);
    // Re-running on every keystroke would replay the entrance animation —
    // this should fire exactly once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  // Toast entrance/hold/exit, decoupled from the sheet's own mount state
  // (see the comment in handleSave). `showToast` only flips the state that
  // mounts the toast div; the actual GSAP entrance runs in the effect
  // below once that div exists — `toastRef.current` is still null at the
  // point `showToast` itself runs, since the state update it just made
  // hasn't committed yet.
  const toastHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = () => {
    if (toastHideTimerRef.current) clearTimeout(toastHideTimerRef.current);
    setToastVisible(true);
  };
  const hideToast = () => {
    if (toastHideTimerRef.current) clearTimeout(toastHideTimerRef.current);
    if (toastRef.current) {
      gsap.to(toastRef.current, {
        y: 26,
        opacity: 0,
        duration: 0.35,
        ease: "power2.in",
        onComplete: () => setToastVisible(false),
      });
    } else {
      setToastVisible(false);
    }
  };
  useEffect(() => {
    if (!toastVisible || !toastRef.current) return;
    gsap.fromTo(
      toastRef.current,
      { y: 26, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.45, ease: "expo.out" },
    );
    toastHideTimerRef.current = setTimeout(hideToast, 1800);
    return () => {
      if (toastHideTimerRef.current) clearTimeout(toastHideTimerRef.current);
    };
    // hideToast is stable enough in practice (only reads refs/state
    // setters); re-running this on every render would replay the entrance
    // animation on unrelated updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toastVisible]);

  const closeWithoutSaving = () => {
    if (!sheetRef.current) {
      onOpenChange(false);
      setMounted(false);
      resetForm();
      return;
    }
    gsap.to(sheetRef.current, {
      yPercent: 100,
      duration: 0.35,
      ease: "power3.in",
      onComplete: () => {
        onOpenChange(false);
        setMounted(false);
        resetForm();
      },
    });
  };

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed || isCreating) return;

    let isUrl = false;
    try {
      const u = new URL(trimmed);
      isUrl = u.protocol === "http:" || u.protocol === "https:";
    } catch {
      isUrl = false;
    }

    const tagsToAttach = stagedTags.map((t) => ({
      tagId: t.id.startsWith("temp-") ? undefined : t.id,
      tagName: t.name,
    }));
    const listIdsToAdd = stagedListIds;
    const shouldSummarise = summariseNow;

    // GSAP timeline: press the button, spring the sheet out, then unmount
    // the sheet/backdrop — matching the design's onSave handler. The toast
    // is a separate, always-mounted element (see below) so its own
    // hold-then-fade doesn't keep the backdrop up and blocking taps on the
    // page underneath for the ~2.5s the toast is visible; only the sheet's
    // own exit needs to finish before the backdrop can go.
    const tl = gsap.timeline();
    if (saveBtnRef.current) {
      tl.to(saveBtnRef.current, { scale: 0.96, duration: 0.1 }).to(
        saveBtnRef.current,
        { scale: 1, duration: 0.18, ease: "back.out(3)" },
      );
    }
    if (sheetRef.current) {
      tl.to(
        sheetRef.current,
        { yPercent: 100, duration: 0.45, ease: "power3.in" },
        "-=.05",
      );
    }
    tl.call(() => {
      onOpenChange(false);
      setMounted(false);
      resetForm();
    });

    showToast();

    createBookmark(
      isUrl
        ? { type: BookmarkTypes.LINK, url: trimmed }
        : { type: BookmarkTypes.TEXT, text: trimmed },
      {
        onSuccess: (bookmark) => {
          lastCreatedIdRef.current = bookmark.id;
          if (tagsToAttach.length) {
            updateTags({
              bookmarkId: bookmark.id,
              attach: tagsToAttach,
              detach: [],
            });
          }
          for (const listId of listIdsToAdd) {
            addToList({ bookmarkId: bookmark.id, listId });
          }
          if (shouldSummarise) {
            summarise({ bookmarkId: bookmark.id });
          }
        },
        onError: () => {
          toast({
            description: "Something went wrong saving that.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <>
      {mounted && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 sm:hidden"
            onClick={closeWithoutSaving}
            aria-hidden
          />
          <div
            ref={sheetRef}
            className="border-k-border bg-k-surface-1 fixed inset-x-0 bottom-0 z-50 flex flex-col gap-[14px] rounded-t-[20px] border-t px-[18px] pb-[30px] pt-[10px] sm:hidden"
            style={{ boxShadow: "0 -24px 60px rgba(0,0,0,.55)" }}
            role="dialog"
            aria-modal="true"
            aria-label="Save a bookmark"
          >
            <div
              className="bg-k-border mx-auto h-1 w-9 flex-none rounded-full"
              aria-hidden
            />
            <div ref={contentRef} className="flex flex-col gap-[14px]">
              <div className="flex items-center gap-[9px]">
                <span className="font-k-mono text-k-accent text-[10px] tracking-[0.08em]">
                  {"// save_link"}
                </span>
                <button
                  type="button"
                  onClick={closeWithoutSaving}
                  aria-label="Cancel"
                  className="text-k-icon ml-auto flex items-center justify-center"
                >
                  <X size={19} strokeWidth={1.8} />
                </button>
              </div>

              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste a link, or write a note…"
                rows={3}
                className="border-k-border bg-k-surface-2 text-k-fg placeholder:text-k-fg-dim resize-none rounded-[13px] border p-[14px] text-[15px] outline-none focus:border-current"
              />

              <div className="flex flex-wrap gap-[7px]">
                <TagChip tags={stagedTags} onChange={setStagedTags} />
                <ListChip value={stagedListIds} onChange={setStagedListIds} />
                <button
                  type="button"
                  onClick={() => setSummariseNow((v) => !v)}
                  className={cn(
                    "rounded-full border px-[11px] py-[5px] text-[11.5px]",
                    summariseNow
                      ? "border-k-accent-border bg-k-accent/10 text-k-accent"
                      : "border-k-border text-k-fg-muted",
                  )}
                >
                  summarise_now
                </button>
              </div>

              <button
                ref={saveBtnRef}
                type="button"
                onClick={handleSave}
                disabled={!text.trim() || isCreating}
                className={cn(
                  "bg-k-accent text-k-accent-fg flex h-[48px] select-none items-center justify-center gap-2 rounded-[13px] text-[15px] font-semibold",
                  "disabled:pointer-events-none disabled:opacity-40",
                )}
              >
                Save
              </button>
              <div className="font-k-mono text-k-fg-dim text-center text-[10.5px]">
                {"// closes on save · summary lands in the queue"}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Always mounted (not gated behind `mounted`), so its own
          hold-then-fade doesn't extend how long the sheet's backdrop
          blocks the page underneath — see the comment in handleSave. */}
      {toastVisible && (
        <div
          ref={toastRef}
          className="border-k-accent-border bg-k-surface-2 fixed inset-x-[18px] z-50 flex items-center gap-[11px] rounded-[13px] border px-[15px] py-[13px] opacity-0 sm:hidden"
          style={{
            bottom: "calc(34px + env(safe-area-inset-bottom))",
            boxShadow: "0 18px 40px rgba(0,0,0,.5)",
          }}
        >
          <Sparkles size={17} className="text-k-accent flex-none" />
          <span className="text-k-fg text-[13px] font-medium">
            Saved to your queue
          </span>
          <button
            type="button"
            className="font-k-mono text-k-accent ml-auto text-[11px] font-medium"
            onClick={() => {
              const id = lastCreatedIdRef.current;
              if (id) deleteBookmark({ bookmarkId: id });
              hideToast();
            }}
          >
            UNDO
          </button>
        </div>
      )}
    </>
  );
}

function TagChip({
  tags,
  onChange,
}: {
  tags: { id: string; name: string; attachedBy: "human" | "ai" }[];
  onChange: (
    tags: { id: string; name: string; attachedBy: "human" | "ai" }[],
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <div className="basis-full">
        <TagsEditor
          tags={tags}
          onAttach={({ tagName, tagId }) =>
            onChange([
              ...tags,
              {
                id: tagId ?? `temp-${tagName}`,
                name: tagName,
                attachedBy: "human",
              },
            ])
          }
          onDetach={({ tagId }) => onChange(tags.filter((t) => t.id !== tagId))}
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="border-k-border text-k-fg-muted rounded-full border px-[11px] py-[5px] text-[11.5px]"
    >
      {tags.length
        ? `${tags.length} tag${tags.length > 1 ? "s" : ""}`
        : "+ tag"}
    </button>
  );
}

function ListChip({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <div className="basis-full">
        <BookmarkListSelector
          multiSelect
          value={value}
          onChange={onChange}
          listTypes={["manual"]}
          placeholder="+ list"
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="border-k-border text-k-fg-muted rounded-full border px-[11px] py-[5px] text-[11.5px]"
    >
      {value.length
        ? `${value.length} list${value.length > 1 ? "s" : ""}`
        : "+ list"}
    </button>
  );
}
