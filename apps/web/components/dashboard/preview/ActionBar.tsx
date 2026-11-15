import type { ComponentProps } from "react";
import { useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import LoadingSpinner from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { MoreHorizontal, Pencil } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";

import BookmarkOptions from "../bookmarks/BookmarkOptions";
import { EditBookmarkDialog } from "../bookmarks/EditBookmarkDialog";
import { ArchivedActionIcon, FavouritedActionIcon } from "../bookmarks/icons";
import { useArchiveBookmarkWithUndo } from "../bookmarks/useArchiveBookmarkWithUndo";
import { ICON_CONTROL_CLASS, RestoreTooltip } from "./IconControl";

type TooltipSide = ComponentProps<typeof TooltipContent>["side"];

export default function ActionBar({
  bookmark,
  className,
  tooltipSide,
}: {
  bookmark: ZBookmark;
  className?: string;
  tooltipSide?: TooltipSide;
}) {
  const { t } = useTranslation();
  const [isEditBookmarkDialogOpen, setEditBookmarkDialogOpen] = useState(false);

  const onError = () => {
    toast({
      variant: "destructive",
      title: t("common.something_went_wrong"),
    });
  };
  // No success toast, as the icon itself shows the new state.
  const { mutate: favBookmark, isPending: pendingFav } = useUpdateBookmark({
    onError,
  });
  const { setArchived, isPending: pendingArchive } =
    useArchiveBookmarkWithUndo();

  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      <Tooltip delayDuration={0}>
        <EditBookmarkDialog
          bookmark={bookmark}
          open={isEditBookmarkDialogOpen}
          setOpen={setEditBookmarkDialogOpen}
        />

        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="none"
            aria-label={t("actions.edit_details")}
            className={ICON_CONTROL_CLASS}
            onClick={() => {
              // A tap blurs the note field in this same task, saving it.
              // The dialog takes the note from the bookmark as it opens, so it
              // waits for that to reach this component.
              window.setTimeout(() => setEditBookmarkDialogOpen(true));
            }}
          >
            <Pencil className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side={tooltipSide}>
            {t("actions.edit_details")}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <ActionButton
            variant="ghost"
            size="none"
            aria-label={
              bookmark.favourited
                ? t("actions.unfavorite")
                : t("actions.favorite")
            }
            aria-pressed={bookmark.favourited}
            className={ICON_CONTROL_CLASS}
            spinner={<LoadingSpinner className="size-4" />}
            loading={pendingFav}
            onClick={() => {
              favBookmark({
                bookmarkId: bookmark.id,
                favourited: !bookmark.favourited,
              });
            }}
          >
            <FavouritedActionIcon
              className="size-4"
              favourited={bookmark.favourited}
            />
          </ActionButton>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side={tooltipSide}>
            {bookmark.favourited
              ? t("actions.unfavorite")
              : t("actions.favorite")}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <ActionButton
            variant="ghost"
            size="none"
            aria-label={
              bookmark.archived ? t("actions.unarchive") : t("actions.archive")
            }
            spinner={<LoadingSpinner className="size-4" />}
            loading={pendingArchive}
            className={ICON_CONTROL_CLASS}
            onClick={() => {
              setArchived(bookmark.id, !bookmark.archived);
            }}
          >
            <ArchivedActionIcon
              className="size-4"
              archived={bookmark.archived}
            />
          </ActionButton>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side={tooltipSide}>
            {bookmark.archived ? <RestoreTooltip /> : t("actions.archive")}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <BookmarkOptions
        bookmark={bookmark}
        // Already available as buttons in this bar (or irrelevant outside the grid)
        hiddenActions={["select", "edit", "edit-tags", "favorite", "archive"]}
        trigger={
          <Button
            variant="ghost"
            size="none"
            aria-label={t("actions.more")}
            className={ICON_CONTROL_CLASS}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        }
        triggerTooltip={{
          label: t("actions.more"),
          side: tooltipSide,
          delayDuration: 0,
        }}
      />
    </div>
  );
}
