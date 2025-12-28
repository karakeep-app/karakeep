import { useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import { Pencil, Trash2 } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";

import DeleteBookmarkConfirmationDialog from "../bookmarks/DeleteBookmarkConfirmationDialog";
import { EditBookmarkDialog } from "../bookmarks/EditBookmarkDialog";
import { ArchivedActionIcon, FavouritedActionIcon } from "../bookmarks/icons";

export default function ActionBar({ bookmark }: { bookmark: ZBookmark }) {
  const { t } = useTranslation();
  const [deleteBookmarkDialogOpen, setDeleteBookmarkDialogOpen] =
    useState(false);

  const [isEditBookmarkDialogOpen, setEditBookmarkDialogOpen] = useState(false);

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
    <div className="flex items-center justify-center gap-3">
      <Tooltip delayDuration={0}>
        <EditBookmarkDialog
          bookmark={bookmark}
          open={isEditBookmarkDialogOpen}
          setOpen={setEditBookmarkDialogOpen}
        />

        <TooltipTrigger asChild>
          <Button
            variant="none"
            className="size-14 rounded-full bg-background"
            onClick={() => {
              setEditBookmarkDialogOpen(true);
            }}
          >
            <Pencil />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("actions.edit")}</TooltipContent>
      </Tooltip>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <ActionButton
            variant="none"
            className="size-14 rounded-full bg-background"
            loading={pendingFav}
            onClick={() => {
              favBookmark({
                bookmarkId: bookmark.id,
                favourited: !bookmark.favourited,
              });
            }}
          >
            <FavouritedActionIcon favourited={bookmark.favourited} />
          </ActionButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {bookmark.favourited
            ? t("actions.unfavorite")
            : t("actions.favorite")}
        </TooltipContent>
      </Tooltip>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <ActionButton
            variant="none"
            loading={pendingArchive}
            className="size-14 rounded-full bg-background"
            onClick={() => {
              archiveBookmark({
                bookmarkId: bookmark.id,
                archived: !bookmark.archived,
              });
            }}
          >
            <ArchivedActionIcon archived={bookmark.archived} />
          </ActionButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {bookmark.archived ? t("actions.unarchive") : t("actions.archive")}
        </TooltipContent>
      </Tooltip>
      <Tooltip delayDuration={0}>
        <DeleteBookmarkConfirmationDialog
          bookmark={bookmark}
          open={deleteBookmarkDialogOpen}
          setOpen={setDeleteBookmarkDialogOpen}
        />
        <TooltipTrigger asChild>
          <Button
            className="size-14 rounded-full bg-background"
            variant="none"
            onClick={() => setDeleteBookmarkDialogOpen(true)}
          >
            <Trash2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("actions.delete")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
