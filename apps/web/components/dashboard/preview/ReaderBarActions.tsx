import { useRef, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import LoadingSpinner from "@/components/ui/spinner";
import { useTranslation } from "@/lib/i18n/client";
import { PopoverAnchor } from "@radix-ui/react-popover";
import { Highlighter, MoreHorizontal, Printer, Tags } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";

import { BookmarkTagsEditor } from "../bookmarks/BookmarkTagsEditor";
import { ArchivedActionIcon, FavouritedActionIcon } from "../bookmarks/icons";
import { useArchiveBookmarkWithUndo } from "../bookmarks/useArchiveBookmarkWithUndo";
import { ICON_CONTROL_CLASS, IconTooltip, RestoreTooltip } from "./IconControl";

function useFavouriteAndArchive() {
  const { t } = useTranslation();
  const { mutate: updateBookmark, isPending: isFavouriting } =
    useUpdateBookmark({
      onError: () => {
        toast({
          variant: "destructive",
          title: t("common.something_went_wrong"),
        });
      },
    });
  const { setArchived, isPending: isArchiving } = useArchiveBookmarkWithUndo();
  return {
    isFavouriting,
    isArchiving,
    toggleFavourite: (bookmark: ZBookmark) =>
      updateBookmark({
        bookmarkId: bookmark.id,
        favourited: !bookmark.favourited,
      }),
    toggleArchived: (bookmark: ZBookmark) =>
      setArchived(bookmark.id, !bookmark.archived),
    favouriteLabel: (bookmark: ZBookmark) =>
      bookmark.favourited ? t("actions.unfavorite") : t("actions.favorite"),
    archiveLabel: (bookmark: ZBookmark) =>
      bookmark.archived ? t("actions.unarchive") : t("actions.archive"),
  };
}

function TagsPopoverContent({
  bookmark,
  onCloseAutoFocus,
}: {
  bookmark: ZBookmark;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <PopoverContent
      ref={contentRef}
      align="end"
      collisionPadding={8}
      className="w-80 max-w-[calc(100vw-1rem)] p-2"
      onOpenAutoFocus={(e) => {
        // Straight to typing, rather than the first tag's remove button.
        e.preventDefault();
        contentRef.current?.querySelector("input")?.focus();
      }}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <BookmarkTagsEditor bookmark={bookmark} variant="inline" />
    </PopoverContent>
  );
}

/** What can be done to a bookmark from the full-screen reader's bar. */
export default function ReaderBarActions({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  const { t } = useTranslation();
  const actions = useFavouriteAndArchive();
  const favouriteLabel = actions.favouriteLabel(bookmark);
  const archiveLabel = actions.archiveLabel(bookmark);

  return (
    <>
      <IconTooltip label={favouriteLabel} side="bottom">
        <ActionButton
          variant="ghost"
          size="none"
          aria-label={favouriteLabel}
          aria-pressed={bookmark.favourited}
          className={ICON_CONTROL_CLASS}
          spinner={<LoadingSpinner className="size-4" />}
          loading={actions.isFavouriting}
          onClick={() => actions.toggleFavourite(bookmark)}
        >
          <FavouritedActionIcon
            className="size-4"
            favourited={bookmark.favourited}
          />
        </ActionButton>
      </IconTooltip>
      <IconTooltip
        label={bookmark.archived ? <RestoreTooltip /> : archiveLabel}
        side="bottom"
      >
        <ActionButton
          variant="ghost"
          size="none"
          aria-label={archiveLabel}
          className={ICON_CONTROL_CLASS}
          spinner={<LoadingSpinner className="size-4" />}
          loading={actions.isArchiving}
          onClick={() => actions.toggleArchived(bookmark)}
        >
          <ArchivedActionIcon className="size-4" archived={bookmark.archived} />
        </ActionButton>
      </IconTooltip>
      <Popover>
        <IconTooltip label={t("common.tags")} side="bottom">
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="none"
              aria-label={t("common.tags")}
              className={ICON_CONTROL_CLASS}
            >
              <Tags className="size-4" />
            </Button>
          </PopoverTrigger>
        </IconTooltip>
        <TagsPopoverContent bookmark={bookmark} />
      </Popover>
    </>
  );
}

/** The reader bar's actions at phone width, where only two icons leave room. */
export function ReaderMoreMenu({
  bookmark,
  className,
  onPrint,
  onShowHighlights,
}: {
  /** Leaves out what only the owner can do, if not given. */
  bookmark?: ZBookmark;
  className?: string;
  onPrint: () => void;
  onShowHighlights: () => void;
}) {
  const { t } = useTranslation();
  const actions = useFavouriteAndArchive();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  // Waits for the menu to have closed: it would take the focus back from the
  // tags, and be there on paper when printing.
  const afterClose = useRef<(() => void) | null>(null);

  return (
    <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
      <PopoverAnchor className={className}>
        <DropdownMenu>
          <IconTooltip label={t("actions.more")} side="bottom">
            <DropdownMenuTrigger asChild>
              <Button
                ref={triggerRef}
                variant="ghost"
                size="none"
                aria-label={t("actions.more")}
                className={ICON_CONTROL_CLASS}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </IconTooltip>
          <DropdownMenuContent
            align="end"
            className="w-56"
            onCloseAutoFocus={(e) => {
              const action = afterClose.current;
              if (action) {
                afterClose.current = null;
                e.preventDefault();
                action();
              }
            }}
          >
            {bookmark && (
              <>
                <DropdownMenuItem
                  disabled={actions.isFavouriting}
                  onSelect={() => actions.toggleFavourite(bookmark)}
                >
                  <FavouritedActionIcon
                    className="size-4"
                    favourited={bookmark.favourited}
                  />
                  {actions.favouriteLabel(bookmark)}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={actions.isArchiving}
                  onSelect={() => actions.toggleArchived(bookmark)}
                >
                  <ArchivedActionIcon
                    className="size-4"
                    archived={bookmark.archived}
                  />
                  {actions.archiveLabel(bookmark)}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    afterClose.current = () => setTagsOpen(true);
                  }}
                >
                  <Tags className="size-4" />
                  {t("common.tags")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={onShowHighlights}>
              <Highlighter className="size-4" />
              {t("common.highlights")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                afterClose.current = onPrint;
              }}
            >
              <Printer className="size-4" />
              {t("preview.print")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PopoverAnchor>
      {bookmark && (
        <TagsPopoverContent
          bookmark={bookmark}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            triggerRef.current?.focus();
          }}
        />
      )}
    </Popover>
  );
}
