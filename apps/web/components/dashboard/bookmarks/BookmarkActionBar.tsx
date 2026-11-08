import Link from "next/link";
import { ButtonWithTooltip, buttonVariants } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSession } from "@/lib/auth/client";
import useBulkActionsStore from "@/lib/bulkActions";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import { useUserSettings } from "@/lib/userSettings";
import { cn } from "@/lib/utils";
import { Maximize2 } from "lucide-react";
import { toast } from "sonner";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import BookmarkOptions from "./BookmarkOptions";
import { CARD_ICON_BUTTON_CLASS, FavouritedActionIcon } from "./icons";

/**
 * Toggles the favourite, or shows it as a plain star for those who can't toggle
 * it and while selecting, when a stray click must only ever select.
 */
export function FavouriteButton({
  bookmark,
  className,
}: {
  bookmark: ZBookmark;
  className?: string;
}) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const demoMode = !!useClientConfig().demoMode;
  const isBulkEditEnabled = useBulkActionsStore(
    (state) => state.isBulkEditEnabled,
  );
  // No success toast: the star itself shows the result
  const { mutate } = useUpdateBookmark({
    onError: () => {
      toast.error(t("common.something_went_wrong"));
    },
  });

  const canToggle =
    session?.user?.id === bookmark.userId && !demoMode && !isBulkEditEnabled;
  const label = bookmark.favourited
    ? t("actions.unfavorite")
    : t("actions.favorite");

  if (!canToggle) {
    return bookmark.favourited ? (
      <span
        role="img"
        aria-label={t("lists.favourites")}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center max-sm:size-11 [@media(pointer:coarse)]:size-11",
          className,
        )}
      >
        <FavouritedActionIcon className="size-4" favourited />
      </span>
    ) : null;
  }

  return (
    <ButtonWithTooltip
      tooltip={label}
      delayDuration={300}
      aria-label={label}
      aria-pressed={bookmark.favourited}
      // Also in the card's menu, and on the f key
      tabIndex={-1}
      variant="ghost"
      size="none"
      className={cn(CARD_ICON_BUTTON_CLASS, "shrink-0", className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        mutate({
          bookmarkId: bookmark.id,
          favourited: !bookmark.favourited,
        });
      }}
    >
      <FavouritedActionIcon
        className="size-4"
        favourited={bookmark.favourited}
      />
    </ButtonWithTooltip>
  );
}

/**
 * What stays on a card without hovering it: its menu, and on phones, where the
 * hover toolbar doesn't exist, whether it's a favourite.
 */
export default function BookmarkActionBar({
  bookmark,
  compact = false,
  hideFavourite = false,
}: {
  bookmark: ZBookmark;
  // A compact row is short of room on phones, so its star is only an indicator
  compact?: boolean;
  // Cards with their star in the corner, on phones too
  hideFavourite?: boolean;
}) {
  const { t } = useTranslation();
  const { bookmarkClickAction } = useUserSettings();
  const isBulkEditEnabled = useBulkActionsStore(
    (state) => state.isBulkEditEnabled,
  );
  // Only links can open anywhere but the preview. Everywhere else the card
  // click already does what this button would.
  const showPreviewButton =
    bookmark.content.type === BookmarkTypes.LINK &&
    bookmarkClickAction === "open_original_link";

  return (
    <div className="flex shrink-0 items-center text-muted-foreground">
      {compact && bookmark.favourited && (
        <span
          role="img"
          aria-label={t("lists.favourites")}
          className="flex size-4 shrink-0 sm:hidden"
        >
          <FavouritedActionIcon className="size-4" favourited />
        </span>
      )}
      {!compact && !hideFavourite && bookmark.favourited && (
        <FavouriteButton bookmark={bookmark} className="sm:hidden" />
      )}
      {/* Kept in the layout while selecting, so the cards don't reflow */}
      <div
        className={cn("flex items-center", isBulkEditEnabled && "invisible")}
      >
        {showPreviewButton && (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Link
                href={`/dashboard/preview/${bookmark.id}`}
                aria-label={t("actions.preview")}
                // Also in the card's menu
                tabIndex={-1}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "none" }),
                  CARD_ICON_BUTTON_CLASS,
                  compact && "max-sm:hidden",
                )}
              >
                <Maximize2 className="size-4" />
              </Link>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent>{t("actions.preview")}</TooltipContent>
            </TooltipPortal>
          </Tooltip>
        )}
        <BookmarkOptions
          bookmark={bookmark}
          showPreviewAction={showPreviewButton}
        />
      </div>
    </div>
  );
}
