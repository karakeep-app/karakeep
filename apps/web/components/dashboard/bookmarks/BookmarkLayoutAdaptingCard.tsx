"use client";

import type { BookmarksLayoutTypes } from "@/lib/userLocalSettings/types";
import type { ReactNode } from "react";
import { useCallback } from "react";
import Link from "next/link";
import { ButtonWithTooltip } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSession } from "@/lib/auth/client";
import { BOOKMARK_DRAG_MIME } from "@/lib/bookmark-drag";
import useBulkActionsStore from "@/lib/bulkActions";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import {
  bookmarkLayoutSwitch,
  useBookmarkDisplaySettings,
  useBookmarkLayout,
} from "@/lib/userLocalSettings/bookmarksLayout";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  GripVertical,
  Image as ImageIcon,
  NotebookPen,
  Square,
} from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useBookmarkListContext } from "@karakeep/shared-react/hooks/bookmark-list-context";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import {
  getBookmarkDisplayTitle,
  isBookmarkStillTagging,
} from "@karakeep/shared/utils/bookmarkUtils";
import { switchCase } from "@karakeep/shared/utils/switch";

import BookmarkActionBar, { FavouriteButton } from "./BookmarkActionBar";
import BookmarkFavicon from "./BookmarkFavicon";
import BookmarkFormattedCreatedAt from "./BookmarkFormattedCreatedAt";
import { getDisplayDomain } from "./FooterLinkURL";
import BookmarkOwnerIcon from "./BookmarkOwnerIcon";
import {
  ArchivedActionIcon,
  CARD_ICON_BUTTON_CLASS,
  CARD_META_CLASS,
  CARD_TITLE_CLASS,
  SelectionCheckbox,
} from "./icons";
import { NotePreview } from "./NotePreview";
import TagList from "./TagList";
import { useArchiveBookmarkWithUndo } from "./useArchiveBookmarkWithUndo";

interface Props {
  bookmark: ZBookmark;
  image: (layout: BookmarksLayoutTypes, className: string) => ReactNode;
  // The image is a stand-in with nothing to show, so it can be kept small
  imageIsPlaceholder?: boolean;
  title?: ReactNode;
  content?: ReactNode;
  footer?: ReactNode;
  className?: string;
  wrapTags: boolean;
  bookmarkIndex?: number;
}

// On phones the tags stay on one line, fading out at the end, as only the sideways
// overflow is clipped. It leaves room for their 44px tap areas, see TagList. The
// fade is a layer on top: a mask would clip those tap areas too.
const CARD_TAG_ROW_CLASS =
  "relative max-sm:flex-nowrap max-sm:[overflow-x:clip] max-sm:[overflow-y:visible] max-sm:after:pointer-events-none max-sm:after:absolute max-sm:after:inset-y-0 max-sm:after:right-0 max-sm:after:w-6 max-sm:after:bg-gradient-to-l max-sm:after:from-card max-sm:after:content-['']";

// The same for what's around the tags, keeping the tap areas in without moving
// anything
const CARD_TAG_ROW_PARENT_CLASS = "max-sm:-my-[11px] max-sm:py-[11px]";

/**
 * A card's tab stops are its title link and its menu. Without a visible title
 * there's nothing else to tab to the preview with, so this stands in for it.
 * Keyboard only: the mouse has the card's own links.
 */
function KeyboardPreviewLink({ bookmark }: { bookmark: ZBookmark }) {
  const { t } = useTranslation();
  const title = getBookmarkDisplayTitle(bookmark) ?? t("common.untitled");
  return (
    <Link
      href={`/dashboard/preview/${bookmark.id}`}
      aria-label={`${t("actions.preview")}: ${title}`}
      className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
    />
  );
}

/**
 * Says what a card is for those with no image to tell by, and keeps the corner
 * clear for the toolbar that goes there on every card, rather than covering text.
 * Tall enough for the toolbar and its offset, see TOOLBAR_FLOATING_CLASS.
 */
function NoteTypeRow() {
  const { t } = useTranslation();
  return (
    <div
      className={cn("flex h-10 shrink-0 items-center px-3", CARD_META_CLASS)}
    >
      <span role="img" aria-label={t("common.note")} className="flex">
        <NotebookPen aria-hidden className="size-4" />
      </span>
    </div>
  );
}

function BottomRow({
  footer,
  tags,
  toolbar,
  hideFavourite,
  bookmark,
}: {
  footer?: ReactNode;
  // For layouts short on height, which have them next to the date from 640px up
  tags?: ReactNode;
  // For layouts where this row is the room the toolbar can have to itself
  toolbar?: ReactNode;
  // For layouts with the star in the card's corner at every width
  hideFavourite?: boolean;
  bookmark: ZBookmark;
}) {
  return (
    <div
      className={cn(
        "flex w-full shrink-0 items-center justify-between gap-2",
        CARD_META_CLASS,
      )}
    >
      {/* From 640px up it's a single line, with the domain giving way to the date.
          On phones it can't give way enough, so the date takes a line of its own
          when it doesn't fit. Starting a line puts its separator left of the row,
          where it's clipped. */}
      <div
        className={cn(
          "min-w-0 flex-1 overflow-hidden",
          !!tags && "sm:max-w-[55%] sm:flex-initial",
        )}
      >
        <div className="-ml-4 flex flex-wrap items-center whitespace-nowrap sm:flex-nowrap">
          {footer && (
            <div className="flex min-w-0 max-w-full pl-4">{footer}</div>
          )}
          <span
            suppressHydrationWarning
            className="relative block h-5 shrink-0 pl-4"
          >
            <span aria-hidden className="absolute left-[5px]">
              •
            </span>
            <BookmarkFormattedCreatedAt createdAt={bookmark.createdAt} />
          </span>
        </div>
      </div>
      {tags && (
        <div className="hidden min-w-0 flex-1 items-center gap-1 overflow-hidden [mask-image:linear-gradient(to_left,transparent,black_1.5rem)] sm:flex">
          {tags}
        </div>
      )}
      <div className="flex shrink-0 items-center">
        {toolbar}
        <BookmarkActionBar bookmark={bookmark} hideFavourite={hideFavourite} />
      </div>
    </div>
  );
}

function OwnerIndicator({
  bookmark,
  className = "right-2 top-2",
}: {
  bookmark: ZBookmark;
  className?: string;
}) {
  const api = useTRPC();
  const listContext = useBookmarkListContext();
  const collaborators = useQuery(
    api.lists.getCollaborators.queryOptions(
      {
        listId: listContext?.id ?? "",
      },
      {
        refetchOnWindowFocus: false,
        enabled: !!listContext?.hasCollaborators,
      },
    ),
  );

  if (!listContext || listContext.userRole === "owner" || !collaborators.data) {
    return null;
  }

  let owner = undefined;
  if (bookmark.userId === collaborators.data.owner?.id) {
    owner = collaborators.data.owner;
  } else {
    owner = collaborators.data.collaborators.find(
      (c) => c.userId === bookmark.userId,
    )?.user;
  }

  if (!owner) return null;

  return (
    <div
      className={cn(
        "absolute z-40 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100",
        className,
      )}
    >
      <BookmarkOwnerIcon ownerName={owner.name} ownerAvatar={owner.image} />
    </div>
  );
}

// A shadow rather than a ring utility, as those get muted on a focused button after
// a click (see tooltip.tsx), which would leave the card just clicked unmarked
const SELECTED_RING_CLASS = "shadow-[inset_0_0_0_2px_hsl(var(--foreground))]";

function BulkEditSelectionOverlay({ bookmark }: { bookmark: ZBookmark }) {
  const isSelected = useBulkActionsStore((s) =>
    s.isBookmarkSelected(bookmark.id),
  );
  const isBulkEditEnabled = useBulkActionsStore((s) => s.isBulkEditEnabled);
  const toggleBookmark = useBulkActionsStore((state) => state.toggleBookmark);
  const { data: session } = useSession();
  const { t } = useTranslation();

  // Don't show selector for non-owned bookmarks or when bulk edit is disabled
  const isOwner = session?.user?.id === bookmark.userId;
  if (!isBulkEditEnabled || !isOwner) return null;

  const title = getBookmarkDisplayTitle(bookmark);

  return (
    <button
      className={cn(
        "absolute inset-0 z-50 rounded-[inherit] outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50",
        isSelected && cn("bg-foreground/5", SELECTED_RING_CLASS),
      )}
      aria-label={
        title ? `${t("actions.select")}: ${title}` : t("actions.select")
      }
      aria-pressed={isSelected}
      onClick={() => toggleBookmark(bookmark.id)}
    ></button>
  );
}

// Rarely what a hover is after, so it takes a moment to show up. It grows out of
// nothing, with the toolbar staying where it is. The starting style is for toolbars
// that only just got drawn, which otherwise have nothing to transition from.
const DRAG_HANDLE_REVEAL_CLASS =
  "w-0 overflow-hidden opacity-0 transition-[width,opacity] duration-150 group-hover:w-8 group-hover:opacity-100 group-hover:delay-500 [@starting-style]:group-hover:w-0 [@starting-style]:group-hover:opacity-0";

function DragHandle({
  bookmark,
  className,
}: {
  bookmark: ZBookmark;
  className?: string;
}) {
  const { t } = useTranslation();
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.setData(BOOKMARK_DRAG_MIME, bookmark.id);
      e.dataTransfer.effectAllowed = "copy";

      // Create a small pill element as the drag preview
      const pill = document.createElement("div");
      const title = getBookmarkDisplayTitle(bookmark) ?? t("common.untitled");
      pill.textContent =
        title.length > 40 ? title.substring(0, 40) + "\u2026" : title;
      Object.assign(pill.style, {
        position: "fixed",
        left: "-9999px",
        top: "-9999px",
        padding: "6px 12px",
        borderRadius: "8px",
        backgroundColor: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        fontSize: "13px",
        fontFamily: "inherit",
        color: "hsl(var(--foreground))",
        maxWidth: "240px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      });
      document.body.appendChild(pill);
      e.dataTransfer.setDragImage(pill, 0, 0);
      requestAnimationFrame(() => pill.remove());
    },
    [bookmark, t],
  );

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <div
          draggable
          role="img"
          aria-label={t("actions.drag_to_list")}
          onDragStart={handleDragStart}
          className={cn(
            "flex h-8 w-8 shrink-0 cursor-grab items-center justify-center text-muted-foreground",
            className,
            DRAG_HANDLE_REVEAL_CLASS,
          )}
        >
          <GripVertical className="size-4" />
        </div>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{t("actions.drag_to_list")}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

// One place on every card. The card's type only decides what it floats over.
const TOOLBAR_FLOATING_CLASS = "absolute right-1.5 top-1.5 z-[60] rounded-md";
const TOOLBAR_TILE_CLASS = "border bg-background/90 shadow-sm backdrop-blur-sm";

// The tile comes in with the buttons on it. Without them it's only the star, which
// a tile would make much more of than it is.
const TOOLBAR_TILE_ON_CARD_HOVER_CLASS =
  "border border-transparent [@media(pointer:fine)]:sm:group-focus-within:border-border [@media(pointer:fine)]:sm:group-focus-within:bg-background/90 [@media(pointer:fine)]:sm:group-focus-within:shadow-sm [@media(pointer:fine)]:sm:group-focus-within:backdrop-blur-sm [@media(pointer:fine)]:sm:group-hover:border-border [@media(pointer:fine)]:sm:group-hover:bg-background/90 [@media(pointer:fine)]:sm:group-hover:shadow-sm [@media(pointer:fine)]:sm:group-hover:backdrop-blur-sm";

// Enough to keep the star apart from a light image, without a tile behind it
const STAR_SHADOW_CLASS =
  "[&>svg]:[filter:drop-shadow(0_1px_2px_rgb(0_0_0/0.35))]";

// Drawn while hovering or focusing the card, on screens that can hover. Phones
// and touch screens get these from the card's menu, and there's nothing to drag
// a card to on a phone.
const SHOW_ON_CARD_HOVER =
  "[@media(pointer:fine)]:sm:group-focus-within:inline-flex [@media(pointer:fine)]:sm:group-hover:inline-flex";

// For toolbars in a row of their own: holds on to its space, so nothing shifts
const FADE_IN_ON_CARD_HOVER =
  "hidden opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:fine)]:sm:inline-flex";

/**
 * Dragging, selecting and archiving. Their buttons stay out of the tab order, as
 * they're also in the card's menu or on a shortcut.
 */
function CardHoverActions({
  bookmark,
  className,
}: {
  bookmark: ZBookmark;
  className?: string;
}) {
  const { t } = useTranslation();
  const enableBulkEditForBookmark = useBulkActionsStore(
    (state) => state.enableBulkEditForBookmark,
  );
  const { data: session } = useSession();
  const demoMode = !!useClientConfig().demoMode;
  const { setArchived } = useArchiveBookmarkWithUndo();

  const isOwner = session?.user?.id === bookmark.userId;
  const archiveLabel = bookmark.archived
    ? t("actions.unarchive")
    : t("actions.archive");

  return (
    <>
      <DragHandle bookmark={bookmark} className={className} />
      {isOwner && (
        <ButtonWithTooltip
          tooltip={t("actions.select")}
          delayDuration={300}
          aria-label={t("actions.select")}
          tabIndex={-1}
          variant="ghost"
          size="none"
          className={cn(CARD_ICON_BUTTON_CLASS, className)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            enableBulkEditForBookmark(bookmark.id);
          }}
        >
          <Square className="size-4" />
        </ButtonWithTooltip>
      )}
      {isOwner && !demoMode && (
        <ButtonWithTooltip
          tooltip={archiveLabel}
          delayDuration={300}
          aria-label={archiveLabel}
          tabIndex={-1}
          variant="ghost"
          size="none"
          className={cn(CARD_ICON_BUTTON_CLASS, className)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setArchived(bookmark.id, !bookmark.archived);
          }}
        >
          <ArchivedActionIcon className="size-4" archived={bookmark.archived} />
        </ButtonWithTooltip>
      )}
    </>
  );
}

/**
 * A compact row's room for the above, between its title and its metadata. It's
 * there whether they're showing or not, so nothing moves or gets covered, and to
 * the eye it's just the space that's after a title anyway. Sized for three
 * 32px buttons, and only for pointers that can hover.
 */
function CompactRowActions({ bookmark }: { bookmark: ZBookmark }) {
  const isBulkEditEnabled = useBulkActionsStore(
    (state) => state.isBulkEditEnabled,
  );
  return (
    <div
      className={cn(
        "relative z-[60] hidden w-24 shrink-0 items-center justify-end opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:fine)]:sm:flex",
        isBulkEditEnabled && "invisible",
      )}
    >
      <CardHoverActions bookmark={bookmark} />
    </div>
  );
}

/**
 * All of a card's hover actions in one place. It floats over the card's image,
 * or sits inline for layouts that have room for it next to the text, which keeps
 * it off the text either way.
 */
function CardToolbar({
  bookmark,
  inline = false,
  starOnly = false,
}: {
  bookmark: ZBookmark;
  inline?: boolean;
  // For compact rows, which have the other actions in a place of their own
  starOnly?: boolean;
}) {
  const isBulkEditEnabled = useBulkActionsStore(
    (state) => state.isBulkEditEnabled,
  );
  const isSelected = useBulkActionsStore((state) =>
    state.isBookmarkSelected(bookmark.id),
  );
  const { data: session } = useSession();

  const isOwner = session?.user?.id === bookmark.userId;

  // Only states while selecting. Clicks go through to the selection overlay.
  if (isBulkEditEnabled) {
    if (!isOwner) {
      return null;
    }
    return (
      <div
        className={cn(
          "pointer-events-none flex items-center",
          inline ? "shrink-0" : cn(TOOLBAR_FLOATING_CLASS, TOOLBAR_TILE_CLASS),
        )}
      >
        <FavouriteButton
          bookmark={bookmark}
          className={
            inline
              ? "max-sm:hidden"
              : "max-sm:size-8 [@media(pointer:coarse)]:size-8"
          }
        />
        <span className="flex size-8 shrink-0 items-center justify-center">
          <SelectionCheckbox checked={isSelected} />
        </span>
      </div>
    );
  }

  const show = inline ? FADE_IN_ON_CARD_HOVER : `hidden ${SHOW_ON_CARD_HOVER}`;

  return (
    <div
      className={cn(
        "items-center",
        inline
          ? "flex shrink-0 max-sm:hidden"
          : cn(
              TOOLBAR_FLOATING_CLASS,
              TOOLBAR_TILE_ON_CARD_HOVER_CLASS,
              // Filling the corner on phones, for the star's 44px tap area
              "max-sm:right-0 max-sm:top-0",
              // A favourite always shows its star, on phones too. The rest of
              // the toolbar comes in around it, leaving it where it is.
              bookmark.favourited
                ? "inline-flex"
                : `hidden ${SHOW_ON_CARD_HOVER}`,
            ),
      )}
    >
      {!starOnly && <CardHoverActions bookmark={bookmark} className={show} />}
      <FavouriteButton
        bookmark={bookmark}
        className={cn(
          !bookmark.favourited && show,
          !inline && bookmark.favourited && STAR_SHADOW_CLASS,
        )}
      />
    </div>
  );
}

function ListView({
  bookmark,
  image,
  title,
  content,
  footer,
  className,
  bookmarkIndex,
}: Props) {
  const { showNotes, showTags, showTitle, imageFit } =
    useBookmarkDisplaySettings();
  const imgFitClass = switchCase(imageFit, {
    cover: "object-cover",
    contain: "bg-muted object-contain",
  });
  const note = showNotes ? bookmark.note?.trim() : undefined;
  const hasTitleLink = showTitle && !!title;
  const excerpt =
    bookmark.content.type === BookmarkTypes.LINK
      ? bookmark.content.description?.trim()
      : undefined;
  const isTagging = isBookmarkStillTagging(bookmark);
  const img = image("list", cn("size-full rounded-md", imgFitClass));

  return (
    <div
      className={cn(
        "group relative isolate flex max-h-80 gap-4 overflow-hidden rounded-lg p-3",
        className,
      )}
      data-bookmark-index={bookmarkIndex}
    >
      <BulkEditSelectionOverlay bookmark={bookmark} />
      <OwnerIndicator bookmark={bookmark} className="left-3 top-3" />
      {!hasTitleLink && <KeyboardPreviewLink bookmark={bookmark} />}
      {img && (
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md sm:size-24">
          {img}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-between overflow-hidden">
        <div
          className={cn(
            "flex min-h-0 flex-col gap-1.5 overflow-hidden sm:gap-1",
            CARD_TAG_ROW_PARENT_CLASS,
          )}
        >
          {showTitle && title && (
            <div className={cn(CARD_TITLE_CLASS, "sm:line-clamp-2")}>
              {title}
            </div>
          )}
          {excerpt && (
            <p className="truncate text-sm text-muted-foreground max-sm:hidden">
              {excerpt}
            </p>
          )}
          {content && (
            <div className="flex min-h-0 shrink flex-col overflow-hidden text-sm">
              {content}
            </div>
          )}
          {note && <NotePreview note={note} bookmarkId={bookmark.id} />}
          {showTags && (
            <div
              className={cn(
                "flex max-h-[3.25rem] shrink-0 flex-wrap gap-1 overflow-hidden sm:hidden",
                CARD_TAG_ROW_CLASS,
              )}
            >
              <TagList bookmark={bookmark} loading={isTagging} />
            </div>
          )}
        </div>
        <BottomRow
          footer={footer}
          tags={
            showTags && !isTagging && bookmark.tags.length > 0 ? (
              <TagList bookmark={bookmark} />
            ) : undefined
          }
          toolbar={<CardToolbar bookmark={bookmark} inline />}
          bookmark={bookmark}
        />
      </div>
    </div>
  );
}

function GridView({
  bookmark,
  image,
  imageIsPlaceholder = false,
  title,
  content,
  footer,
  className,
  wrapTags,
  layout,
  bookmarkIndex,
}: Props & { layout: BookmarksLayoutTypes }) {
  const { showNotes, showTags, showTitle, imageFit } =
    useBookmarkDisplaySettings();
  const imgFitClass = switchCase(imageFit, {
    cover: "object-cover",
    contain: "bg-muted object-contain",
  });
  const note = showNotes ? bookmark.note?.trim() : undefined;
  // Masonry cards take the height of their content. Grid cards are all the same
  // height so they line up, which also rules out a smaller placeholder there.
  const isFixedHeight = layout === "grid";
  const img = image(layout, cn("size-full rounded-t-lg", imgFitClass));
  // Notes are the only cards with body text. In a same-height card a banner takes
  // up whatever the text leaves free, so a short note leaves no blank area.
  const imageFillsCard = isFixedHeight && !!content && !!img;
  // Phones have a single column, so there's no row to line up with: cards take the
  // height of their content there, leaving a stand-in image with no reason to be big
  const phoneImageClass = imageIsPlaceholder
    ? "max-sm:h-14 max-sm:min-h-0 max-sm:flex-none"
    : "max-sm:h-40 max-sm:flex-none";
  const hasTitleLink = showTitle && !!title;

  return (
    <div
      className={cn(
        "group relative isolate flex flex-col overflow-hidden rounded-lg",
        className,
        // An image, a two line title, a row of tags and the footer, and no more
        isFixedHeight && "h-[18.25rem] max-sm:h-auto",
      )}
      data-bookmark-index={bookmarkIndex}
    >
      <BulkEditSelectionOverlay bookmark={bookmark} />
      <OwnerIndicator bookmark={bookmark} className="left-2 top-2" />
      {!hasTitleLink && <KeyboardPreviewLink bookmark={bookmark} />}
      <CardToolbar bookmark={bookmark} />
      {img ? (
        <div
          className={cn(
            "w-full overflow-hidden",
            imageFillsCard
              ? "min-h-20 flex-1"
              : cn(
                  "shrink-0",
                  !isFixedHeight && imageIsPlaceholder ? "h-14" : "h-40",
                ),
            phoneImageClass,
          )}
        >
          {img}
        </div>
      ) : (
        <NoteTypeRow />
      )}
      <div
        className={cn(
          "flex min-h-0 flex-col gap-1 p-3 pb-1.5",
          !img && "pt-0",
          imageFillsCard ? "flex-initial" : "flex-1",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 flex-auto flex-col gap-2 overflow-hidden",
            CARD_TAG_ROW_PARENT_CLASS,
          )}
        >
          {showTitle && title && (
            <div className={CARD_TITLE_CLASS}>{title}</div>
          )}
          {content && (
            <div className="flex min-h-0 shrink flex-col overflow-hidden text-sm">
              {content}
            </div>
          )}
          {note && <NotePreview note={note} bookmarkId={bookmark.id} />}
          {showTags && (
            <div
              className={cn(
                "flex shrink-0 flex-wrap gap-1 overflow-hidden",
                // A shorter title leaves its room above the tags, not below them,
                // which keeps a row of cards' tags and footers lined up
                isFixedHeight ? "mt-auto max-h-6" : "max-h-[3.25rem]",
                CARD_TAG_ROW_CLASS,
              )}
            >
              <TagList
                className={wrapTags ? undefined : "h-full"}
                bookmark={bookmark}
                loading={isBookmarkStillTagging(bookmark)}
              />
            </div>
          )}
        </div>
        <BottomRow footer={footer} hideFavourite bookmark={bookmark} />
      </div>
    </div>
  );
}

function CompactView({
  bookmark,
  title,
  footer,
  className,
  bookmarkIndex,
}: Props) {
  const { t } = useTranslation();
  const { showTitle } = useBookmarkDisplaySettings();
  const isBulkEditEnabled = useBulkActionsStore(
    (state) => state.isBulkEditEnabled,
  );

  return (
    <div
      className={cn(
        "group relative isolate flex min-h-10 items-center gap-2 pl-3 pr-1 text-sm transition-colors focus-within:bg-accent/50 hover:bg-accent/50 max-sm:min-h-11 [@media(pointer:coarse)]:min-h-11",
        className,
      )}
      data-bookmark-index={bookmarkIndex}
    >
      <BulkEditSelectionOverlay bookmark={bookmark} />
      <OwnerIndicator bookmark={bookmark} />
      {!showTitle && <KeyboardPreviewLink bookmark={bookmark} />}
      {bookmark.content.type === BookmarkTypes.LINK && (
        <BookmarkFavicon
          src={bookmark.content.favicon}
          domain={getDisplayDomain(bookmark.content.url)}
        />
      )}
      {bookmark.content.type === BookmarkTypes.TEXT && (
        <NotebookPen className="size-4 shrink-0 text-muted-foreground" />
      )}
      {bookmark.content.type === BookmarkTypes.ASSET && (
        <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="line-clamp-2 min-w-0 flex-1 break-words font-medium sm:line-clamp-none sm:truncate">
        {showTitle &&
          (title ?? (
            <Link href={`/dashboard/preview/${bookmark.id}`}>
              {getBookmarkDisplayTitle(bookmark) ?? t("common.untitled")}
            </Link>
          ))}
      </div>
      <CompactRowActions bookmark={bookmark} />
      <div
        className={cn(
          "hidden min-w-0 max-w-[20%] shrink-0 items-center gap-1.5 whitespace-nowrap sm:flex lg:max-w-[30%]",
          CARD_META_CLASS,
        )}
      >
        {footer}
      </div>
      {/* The widest it gets is "Sep 28, 2025". Fixed, so the rows' columns line up. */}
      <span
        suppressHydrationWarning
        className={cn(
          "hidden w-[5.5rem] shrink-0 text-right tabular-nums sm:block",
          CARD_META_CLASS,
        )}
      >
        <BookmarkFormattedCreatedAt createdAt={bookmark.createdAt} />
      </span>
      <div
        className={cn(
          "relative flex shrink-0 items-center",
          !isBulkEditEnabled && "z-[60]",
        )}
      >
        <CardToolbar bookmark={bookmark} inline starOnly />
        {/* A phone row can't fit these next to the title while selecting */}
        <div className={cn(isBulkEditEnabled && "max-sm:hidden")}>
          <BookmarkActionBar bookmark={bookmark} compact />
        </div>
      </div>
    </div>
  );
}

export function BookmarkLayoutAdaptingCard(props: Props) {
  const layout = useBookmarkLayout();

  return bookmarkLayoutSwitch(layout, {
    masonry: <GridView layout={layout} {...props} />,
    grid: <GridView layout={layout} {...props} />,
    list: <ListView {...props} />,
    compact: <CompactView {...props} />,
  });
}
