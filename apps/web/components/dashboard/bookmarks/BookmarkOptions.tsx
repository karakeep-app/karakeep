"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { useClientConfig } from "@/lib/clientConfig";
import { useTranslation } from "@/lib/i18n/client";
import {
  FileDown,
  Link,
  List,
  ListX,
  MoreHorizontal,
  Pencil,
  RotateCw,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useSession } from "next-auth/react";

import type {
  ZBookmark,
  ZBookmarkedLink,
} from "@karakeep/shared/types/bookmarks";
import {
  useRecrawlBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks//bookmarks";
import { useRemoveBookmarkFromList } from "@karakeep/shared-react/hooks//lists";
import { useBookmarkGridContext } from "@karakeep/shared-react/hooks/bookmark-grid-context";
import { useBookmarkListContext } from "@karakeep/shared-react/hooks/bookmark-list-context";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { BookmarkedTextEditor } from "./BookmarkedTextEditor";
import DeleteBookmarkConfirmationDialog from "./DeleteBookmarkConfirmationDialog";
import { EditBookmarkDialog } from "./EditBookmarkDialog";
import { ArchivedActionIcon, FavouritedActionIcon } from "./icons";
import { useManageListsModal } from "./ManageListsModal";

export default function BookmarkOptions({ bookmark }: { bookmark: ZBookmark }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const linkId = bookmark.id;
  const { data: session } = useSession();

  const demoMode = !!useClientConfig().demoMode;

  // Check if the current user owns this bookmark
  const isOwner = session?.user?.id === bookmark.userId;

  const [isClipboardAvailable, setIsClipboardAvailable] = useState(false);

  useEffect(() => {
    // This code only runs in the browser
    setIsClipboardAvailable(
      typeof window !== "undefined" &&
        window.navigator &&
        !!window.navigator.clipboard,
    );
  }, []);

  const { setOpen: setManageListsModalOpen, content: manageListsModal } =
    useManageListsModal(bookmark.id);

  const [deleteBookmarkDialogOpen, setDeleteBookmarkDialogOpen] =
    useState(false);
  const [isTextEditorOpen, setTextEditorOpen] = useState(false);
  const [isEditBookmarkDialogOpen, setEditBookmarkDialogOpen] = useState(false);

  const { listId } = useBookmarkGridContext() ?? {};
  const withinListContext = useBookmarkListContext();

  const onError = () => {
    toast({
      variant: "destructive",
      title: t("common.something_went_wrong"),
    });
  };

  const updateBookmarkMutator = useUpdateBookmark({
    onSuccess: () => {
      toast({
        description: t("toasts.bookmarks.updated"),
      });
    },
    onError,
  });

  const crawlBookmarkMutator = useRecrawlBookmark({
    onSuccess: () => {
      toast({
        description: t("toasts.bookmarks.refetch"),
      });
    },
    onError,
  });

  const fullPageArchiveBookmarkMutator = useRecrawlBookmark({
    onSuccess: () => {
      toast({
        description: t("toasts.bookmarks.full_page_archive"),
      });
    },
    onError,
  });

  const removeFromListMutator = useRemoveBookmarkFromList({
    onSuccess: () => {
      toast({
        description: t("toasts.bookmarks.delete_from_list"),
      });
    },
    onError,
  });

  return (
    <>
      {manageListsModal}
      <EditBookmarkDialog
        bookmark={bookmark}
        open={isEditBookmarkDialogOpen}
        setOpen={setEditBookmarkDialogOpen}
      />
      <DeleteBookmarkConfirmationDialog
        bookmark={bookmark}
        open={deleteBookmarkDialogOpen}
        setOpen={setDeleteBookmarkDialogOpen}
      />
      <BookmarkedTextEditor
        bookmark={bookmark}
        open={isTextEditorOpen}
        setOpen={setTextEditorOpen}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="px-1 focus-visible:ring-0 focus-visible:ring-offset-0"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-fit">
          {isOwner && (
            <DropdownMenuItem onClick={() => setEditBookmarkDialogOpen(true)}>
              <Pencil className="mr-2 size-4" />
              <span>{t("actions.edit")}</span>
            </DropdownMenuItem>
          )}
          {isOwner && bookmark.content.type === BookmarkTypes.TEXT && (
            <DropdownMenuItem onClick={() => setTextEditorOpen(true)}>
              <SquarePen className="mr-2 size-4" />
              <span>{t("actions.open_editor")}</span>
            </DropdownMenuItem>
          )}
          {isOwner && (
            <DropdownMenuItem
              disabled={demoMode}
              onClick={() =>
                updateBookmarkMutator.mutate({
                  bookmarkId: linkId,
                  favourited: !bookmark.favourited,
                })
              }
            >
              <FavouritedActionIcon
                className="mr-2 size-4"
                favourited={bookmark.favourited}
              />
              <span>
                {bookmark.favourited
                  ? t("actions.unfavorite")
                  : t("actions.favorite")}
              </span>
            </DropdownMenuItem>
          )}
          {isOwner && (
            <DropdownMenuItem
              disabled={demoMode}
              onClick={() =>
                updateBookmarkMutator.mutate({
                  bookmarkId: linkId,
                  archived: !bookmark.archived,
                })
              }
            >
              <ArchivedActionIcon
                className="mr-2 size-4"
                archived={bookmark.archived}
              />
              <span>
                {bookmark.archived
                  ? t("actions.unarchive")
                  : t("actions.archive")}
              </span>
            </DropdownMenuItem>
          )}

          {isOwner && bookmark.content.type === BookmarkTypes.LINK && (
            <DropdownMenuItem
              onClick={() => {
                fullPageArchiveBookmarkMutator.mutate({
                  bookmarkId: bookmark.id,
                  archiveFullPage: true,
                });
              }}
            >
              <FileDown className="mr-2 size-4" />
              <span>{t("actions.download_full_page_archive")}</span>
            </DropdownMenuItem>
          )}

          {bookmark.content.type === BookmarkTypes.LINK && (
            <DropdownMenuItem
              disabled={!isClipboardAvailable}
              onClick={() => {
                navigator.clipboard.writeText(
                  (bookmark.content as ZBookmarkedLink).url,
                );
                toast({
                  description: t("toasts.bookmarks.clipboard_copied"),
                });
              }}
            >
              <Link className="mr-2 size-4" />
              <span>{t("actions.copy_link")}</span>
            </DropdownMenuItem>
          )}

          {isOwner && (
            <DropdownMenuItem onClick={() => setManageListsModalOpen(true)}>
              <List className="mr-2 size-4" />
              <span>{t("actions.manage_lists")}</span>
            </DropdownMenuItem>
          )}

          {isOwner &&
            listId &&
            withinListContext &&
            withinListContext.type === "manual" && (
              <DropdownMenuItem
                disabled={demoMode}
                onClick={() =>
                  removeFromListMutator.mutate({
                    listId,
                    bookmarkId: bookmark.id,
                  })
                }
              >
                <ListX className="mr-2 size-4" />
                <span>{t("actions.remove_from_list")}</span>
              </DropdownMenuItem>
            )}

          {isOwner && bookmark.content.type === BookmarkTypes.LINK && (
            <DropdownMenuItem
              disabled={demoMode}
              onClick={() =>
                crawlBookmarkMutator.mutate({ bookmarkId: bookmark.id })
              }
            >
              <RotateCw className="mr-2 size-4" />
              <span>{t("actions.refresh")}</span>
            </DropdownMenuItem>
          )}
          {isOwner && (
            <DropdownMenuItem
              disabled={demoMode}
              className="text-destructive"
              onClick={() => setDeleteBookmarkDialogOpen(true)}
            >
              <Trash2 className="mr-2 size-4" />
              <span>{t("actions.delete")}</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
