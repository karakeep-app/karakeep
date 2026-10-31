import { useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button, ButtonWithTooltip } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTrashBookmark } from "@/lib/hooks/useTrashBookmark";
import { useTranslation } from "@/lib/i18n/client";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";

import BookmarkOptions from "../bookmarks/BookmarkOptions";
import DeleteBookmarkConfirmationDialog from "../bookmarks/DeleteBookmarkConfirmationDialog";
import { EditBookmarkDialog } from "../bookmarks/EditBookmarkDialog";
import { ArchivedActionIcon, FavouritedActionIcon } from "../bookmarks/icons";

export default function ActionBar({ bookmark }: { bookmark: ZBookmark }) {
  const { t } = useTranslation();
  const [deleteBookmarkDialogOpen, setDeleteBookmarkDialogOpen] =
    useState(false);

  const [isEditBookmarkDialogOpen, setEditBookmarkDialogOpen] = useState(false);
  const { mutate: trashBookmark } = useTrashBookmark();

  const onError = () => {
    toast({
      variant: "destructive",
      title: "Something went wrong",
      description: "There was a problem with your request.",
    });
  };
  const { mutate: favBookmark, isPending: pendingFav } = useUpdateBookmark({
    onSuccess: () => {
      toast({
        description: "The bookmark has been updated!",
      });
    },
    onError,
  });
  const { mutate: archiveBookmark, isPending: pendingArchive } =
    useUpdateBookmark({
      onSuccess: (resp) => {
        toast({
          description: `The bookmark has been ${resp.archived ? "Archived" : "Un-archived"}!`,
        });
      },
      onError,
    });

  return (
    <div className="flex items-center justify-center gap-3 text-muted-foreground">
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
            className="size-8 rounded-md"
            onClick={() => {
              setEditBookmarkDialogOpen(true);
            }}
          >
            <Pencil className="size-[18px]" size={18} strokeWidth={1.5} />
          </Button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>{t("actions.edit")}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <ActionButton
            variant="ghost"
            size="none"
            className="size-8 rounded-md"
            loading={pendingFav}
            onClick={() => {
              favBookmark({
                bookmarkId: bookmark.id,
                favourited: !bookmark.favourited,
              });
            }}
          >
            <FavouritedActionIcon
              className="size-[18px]"
              favourited={bookmark.favourited}
              size={18}
              strokeWidth={1.5}
            />
          </ActionButton>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>
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
            loading={pendingArchive}
            className="size-8 rounded-md"
            onClick={() => {
              archiveBookmark({
                bookmarkId: bookmark.id,
                archived: !bookmark.archived,
              });
            }}
          >
            <ArchivedActionIcon
              className="size-[18px]"
              archived={bookmark.archived}
              size={18}
              strokeWidth={1.5}
            />
          </ActionButton>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>
            {bookmark.archived ? t("actions.unarchive") : t("actions.archive")}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <Tooltip delayDuration={0}>
        <DeleteBookmarkConfirmationDialog
          bookmark={bookmark}
          open={deleteBookmarkDialogOpen}
          setOpen={setDeleteBookmarkDialogOpen}
        />
        <TooltipTrigger asChild>
          <Button
            className="size-8 rounded-md"
            variant="ghost"
            size="none"
            onClick={() =>
              bookmark.deleteAt
                ? setDeleteBookmarkDialogOpen(true)
                : trashBookmark({ bookmarkId: bookmark.id })
            }
          >
            <Trash2 className="size-[18px]" size={18} strokeWidth={1.5} />
          </Button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>
            {bookmark.deleteAt
              ? t("actions.delete_permanently")
              : t("actions.delete")}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <BookmarkOptions
        bookmark={bookmark}
        // Already available as buttons in this bar (or irrelevant outside the grid)
        hiddenActions={[
          "select",
          "edit",
          "favorite",
          "archive",
          "delete",
          "delete-permanently",
        ]}
        trigger={
          <ButtonWithTooltip
            tooltip={t("actions.more")}
            delayDuration={0}
            variant="ghost"
            size="none"
            className="size-8 rounded-md"
          >
            <MoreHorizontal className="size-[18px]" strokeWidth={1.5} />
          </ButtonWithTooltip>
        }
      />
    </div>
  );
}
