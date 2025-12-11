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

  // Define action items array
  const actionItems = [
    {
      id: "edit",
      title: t("actions.edit"),
      icon: <Pencil className="mr-2 size-4" />,
      visible: isOwner,
      disabled: false,
      onClick: () => setEditBookmarkDialogOpen(true),
    },
    {
      id: "open-editor",
      title: t("actions.open_editor"),
      icon: <SquarePen className="mr-2 size-4" />,
      visible: isOwner && bookmark.content.type === BookmarkTypes.TEXT,
      disabled: false,
      onClick: () => setTextEditorOpen(true),
    },
    {
      id: "favorite",
      title: bookmark.favourited
        ? t("actions.unfavorite")
        : t("actions.favorite"),
      icon: (
        <FavouritedActionIcon
          className="mr-2 size-4"
          favourited={bookmark.favourited}
        />
      ),
      visible: isOwner,
      disabled: demoMode,
      onClick: () =>
        updateBookmarkMutator.mutate({
          bookmarkId: linkId,
          favourited: !bookmark.favourited,
        }),
    },
    {
      id: "archive",
      title: bookmark.archived ? t("actions.unarchive") : t("actions.archive"),
      icon: (
        <ArchivedActionIcon
          className="mr-2 size-4"
          archived={bookmark.archived}
        />
      ),
      visible: isOwner,
      disabled: demoMode,
      onClick: () =>
        updateBookmarkMutator.mutate({
          bookmarkId: linkId,
          archived: !bookmark.archived,
        }),
    },
    {
      id: "download-full-page",
      title: t("actions.download_full_page_archive"),
      icon: <FileDown className="mr-2 size-4" />,
      visible: isOwner && bookmark.content.type === BookmarkTypes.LINK,
      disabled: false,
      onClick: () => {
        fullPageArchiveBookmarkMutator.mutate({
          bookmarkId: bookmark.id,
          archiveFullPage: true,
        });
      },
    },
    {
      id: "copy-link",
      title: t("actions.copy_link"),
      icon: <Link className="mr-2 size-4" />,
      visible: bookmark.content.type === BookmarkTypes.LINK,
      disabled: !isClipboardAvailable,
      onClick: () => {
        navigator.clipboard.writeText(
          (bookmark.content as ZBookmarkedLink).url,
        );
        toast({
          description: t("toasts.bookmarks.clipboard_copied"),
        });
      },
    },
    {
      id: "manage-lists",
      title: t("actions.manage_lists"),
      icon: <List className="mr-2 size-4" />,
      visible: isOwner,
      disabled: false,
      onClick: () => setManageListsModalOpen(true),
    },
    {
      id: "remove-from-list",
      title: t("actions.remove_from_list"),
      icon: <ListX className="mr-2 size-4" />,
      visible:
        (isOwner ||
          (withinListContext &&
            (withinListContext.userRole === "editor" ||
              withinListContext.userRole === "owner"))) &&
        !!listId &&
        !!withinListContext &&
        withinListContext.type === "manual",
      disabled: demoMode,
      onClick: () =>
        removeFromListMutator.mutate({
          listId: listId!,
          bookmarkId: bookmark.id,
        }),
    },
    {
      id: "refresh",
      title: t("actions.refresh"),
      icon: <RotateCw className="mr-2 size-4" />,
      visible: isOwner && bookmark.content.type === BookmarkTypes.LINK,
      disabled: demoMode,
      onClick: () => crawlBookmarkMutator.mutate({ bookmarkId: bookmark.id }),
    },
    {
      id: "delete",
      title: t("actions.delete"),
      icon: <Trash2 className="mr-2 size-4" />,
      visible: isOwner,
      disabled: demoMode,
      className: "text-destructive",
      onClick: () => setDeleteBookmarkDialogOpen(true),
    },
  ];

  // Filter visible items
  const visibleItems = actionItems.filter((item) => item.visible);

  // If no items are visible, don't render the dropdown
  if (visibleItems.length === 0) {
    return null;
  }

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
          {visibleItems.map((item) => (
            <DropdownMenuItem
              key={item.id}
              disabled={item.disabled}
              className={item.className}
              onClick={item.onClick}
            >
              {item.icon}
              <span>{item.title}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
