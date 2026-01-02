"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ActionButton,
  ActionButtonWithTooltip,
} from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import { toast } from "@/components/ui/sonner";
import useBulkActionsStore from "@/lib/bulkActions";
import { useTranslation } from "@/lib/i18n/client";
import {
  CheckCheck,
  FileDown,
  Hash,
  Link,
  List,
  ListMinus,
  Pencil,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";

import {
  useDeleteBookmark,
  useRecrawlBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { useRemoveBookmarkFromList } from "@karakeep/shared-react/hooks/lists";
import { limitConcurrency } from "@karakeep/shared/concurrency";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import BulkManageListsModal from "./bookmarks/BulkManageListsModal";
import BulkTagModal from "./bookmarks/BulkTagModal";
import { ArchivedActionIcon, FavouritedActionIcon } from "./bookmarks/icons";

const MAX_CONCURRENT_BULK_ACTIONS = 50;

export default function BulkBookmarksAction() {
  const { t } = useTranslation();
  const {
    selectedBookmarks,
    isBulkEditEnabled,
    listContext: withinListContext,
  } = useBulkActionsStore();
  const setIsBulkEditEnabled = useBulkActionsStore(
    (state) => state.setIsBulkEditEnabled,
  );
  const selectAllBookmarks = useBulkActionsStore((state) => state.selectAll);
  const unSelectAllBookmarks = useBulkActionsStore(
    (state) => state.unSelectAll,
  );
  const isEverythingSelected = useBulkActionsStore(
    (state) => state.isEverythingSelected,
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRemoveFromListDialogOpen, setIsRemoveFromListDialogOpen] =
    useState(false);
  const [manageListsModal, setManageListsModalOpen] = useState(false);
  const [bulkTagModal, setBulkTagModalOpen] = useState(false);
  const pathname = usePathname();
  const [currentPathname, setCurrentPathname] = useState("");

  // Reset bulk edit state when the route changes
  useEffect(() => {
    if (pathname !== currentPathname) {
      setCurrentPathname(pathname);
      setIsBulkEditEnabled(false);
    }
  }, [pathname, currentPathname]);

  const onError = () => {
    toast({
      variant: "destructive",
      title: "Something went wrong",
      description: "There was a problem with your request.",
    });
  };

  const deleteBookmarkMutator = useDeleteBookmark({
    onSuccess: () => {
      setIsBulkEditEnabled(false);
    },
    onError,
  });

  const updateBookmarkMutator = useUpdateBookmark({
    onSuccess: () => {
      setIsBulkEditEnabled(false);
    },
    onError,
  });

  const recrawlBookmarkMutator = useRecrawlBookmark({
    onSuccess: () => {
      setIsBulkEditEnabled(false);
    },
    onError,
  });

  const removeBookmarkFromListMutator = useRemoveBookmarkFromList({
    onSuccess: () => {
      setIsBulkEditEnabled(false);
    },
    onError,
  });

  interface UpdateBookmarkProps {
    favourited?: boolean;
    archived?: boolean;
  }

  const recrawlBookmarks = async (archiveFullPage: boolean) => {
    const links = selectedBookmarks.filter(
      (item) => item.content.type === BookmarkTypes.LINK,
    );
    await Promise.all(
      limitConcurrency(
        links.map(
          (item) => () =>
            recrawlBookmarkMutator.mutateAsync({
              bookmarkId: item.id,
              archiveFullPage,
            }),
        ),
        MAX_CONCURRENT_BULK_ACTIONS,
      ),
    );
    toast({
      description: `${links.length} bookmarks will be ${archiveFullPage ? "re-crawled and archived!" : "refreshed!"}`,
    });
  };

  function isClipboardAvailable() {
    if (typeof window === "undefined") {
      return false;
    }
    return window && window.navigator && window.navigator.clipboard;
  }

  const copyLinks = async () => {
    if (!isClipboardAvailable()) {
      toast({
        description: `Copying is only available over https`,
      });
      return;
    }
    const copyString = selectedBookmarks
      .map((item) => {
        return item.content.type === BookmarkTypes.LINK && item.content.url;
      })
      .filter(Boolean)
      .join("\n");

    await navigator.clipboard.writeText(copyString);

    toast({
      description: `Added ${selectedBookmarks.length} bookmark links into the clipboard!`,
    });
  };

  const updateBookmarks = async ({
    favourited,
    archived,
  }: UpdateBookmarkProps) => {
    await Promise.all(
      limitConcurrency(
        selectedBookmarks.map(
          (item) => () =>
            updateBookmarkMutator.mutateAsync({
              bookmarkId: item.id,
              favourited,
              archived,
            }),
        ),
        MAX_CONCURRENT_BULK_ACTIONS,
      ),
    );
    toast({
      description: `${selectedBookmarks.length} bookmarks have been updated!`,
    });
  };

  const deleteBookmarks = async () => {
    await Promise.all(
      limitConcurrency(
        selectedBookmarks.map(
          (item) => () =>
            deleteBookmarkMutator.mutateAsync({ bookmarkId: item.id }),
        ),
        MAX_CONCURRENT_BULK_ACTIONS,
      ),
    );
    toast({
      description: `${selectedBookmarks.length} bookmarks have been deleted!`,
    });
    setIsDeleteDialogOpen(false);
  };

  const removeBookmarksFromList = async () => {
    if (!withinListContext) return;

    const results = await Promise.allSettled(
      limitConcurrency(
        selectedBookmarks.map(
          (item) => () =>
            removeBookmarkFromListMutator.mutateAsync({
              bookmarkId: item.id,
              listId: withinListContext.id,
            }),
        ),
        MAX_CONCURRENT_BULK_ACTIONS,
      ),
    );

    const successes = results.filter((r) => r.status === "fulfilled").length;
    if (successes > 0) {
      toast({
        description: `${successes} bookmarks have been removed from the list!`,
      });
    }
    setIsRemoveFromListDialogOpen(false);
  };

  const alreadyFavourited =
    selectedBookmarks.length &&
    selectedBookmarks.every((item) => item.favourited === true);

  const alreadyArchived =
    selectedBookmarks.length &&
    selectedBookmarks.every((item) => item.archived === true);

  const actionList = [
    {
      name: isClipboardAvailable()
        ? t("actions.copy_link")
        : "Copying is only available over https",
      icon: <Link size={18} />,
      action: () => copyLinks(),
      isPending: false,
      hidden: !isBulkEditEnabled,
    },
    {
      name: t("actions.remove_from_list"),
      icon: <ListMinus size={18} />,
      action: () => setIsRemoveFromListDialogOpen(true),
      isPending: removeBookmarkFromListMutator.isPending,
      hidden:
        !isBulkEditEnabled ||
        !withinListContext ||
        withinListContext.type !== "manual" ||
        (withinListContext.userRole !== "editor" &&
          withinListContext.userRole !== "owner"),
    },
    {
      name: t("actions.add_to_list"),
      icon: <List size={18} />,
      action: () => setManageListsModalOpen(true),
      isPending: false,
      hidden: !isBulkEditEnabled,
    },
    {
      name: t("actions.edit_tags"),
      icon: <Hash size={18} />,
      action: () => setBulkTagModalOpen(true),
      isPending: false,
      hidden: !isBulkEditEnabled,
    },
    {
      name: alreadyFavourited ? t("actions.unfavorite") : t("actions.favorite"),
      icon: <FavouritedActionIcon favourited={!!alreadyFavourited} size={18} />,
      action: () => updateBookmarks({ favourited: !alreadyFavourited }),
      isPending: updateBookmarkMutator.isPending,
      hidden: !isBulkEditEnabled,
    },
    {
      name: alreadyArchived ? t("actions.unarchive") : t("actions.archive"),
      icon: <ArchivedActionIcon size={18} archived={!!alreadyArchived} />,
      action: () => updateBookmarks({ archived: !alreadyArchived }),
      isPending: updateBookmarkMutator.isPending,
      hidden: !isBulkEditEnabled,
    },
    {
      name: t("actions.preserve_offline_archive"),
      icon: <FileDown size={18} />,
      action: () => recrawlBookmarks(true),
      isPending: recrawlBookmarkMutator.isPending,
      hidden: !isBulkEditEnabled,
    },
    {
      name: t("actions.refresh"),
      icon: <RotateCw size={18} />,
      action: () => recrawlBookmarks(false),
      isPending: recrawlBookmarkMutator.isPending,
      hidden: !isBulkEditEnabled,
    },
    {
      name: t("actions.delete"),
      icon: <Trash2 size={18} color="red" />,
      action: () => setIsDeleteDialogOpen(true),
      hidden: !isBulkEditEnabled,
    },
    {
      name: isEverythingSelected()
        ? t("actions.unselect_all")
        : t("actions.select_all"),
      icon: (
        <p className="flex items-center gap-2">
          ( <CheckCheck size={18} /> {selectedBookmarks.length} )
        </p>
      ),
      action: () =>
        isEverythingSelected() ? unSelectAllBookmarks() : selectAllBookmarks(),
      alwaysEnable: true,
      hidden: !isBulkEditEnabled,
    },
    {
      name: t("actions.close_bulk_edit"),
      icon: <X size={18} />,
      action: () => setIsBulkEditEnabled(false),
      alwaysEnable: true,
      hidden: !isBulkEditEnabled,
    },
    {
      name: t("actions.bulk_edit"),
      icon: <Pencil size={18} />,
      action: () => setIsBulkEditEnabled(true),
      alwaysEnable: true,
      hidden: isBulkEditEnabled,
    },
  ];

  return (
    <div>
      <ActionConfirmingDialog
        open={isDeleteDialogOpen}
        setOpen={setIsDeleteDialogOpen}
        title={"Delete Bookmarks"}
        description={<p>Are you sure you want to delete these bookmarks?</p>}
        actionButton={() => (
          <ActionButton
            type="button"
            variant="destructive"
            loading={deleteBookmarkMutator.isPending}
            onClick={() => deleteBookmarks()}
          >
            {t("actions.delete")}
          </ActionButton>
        )}
      />
      <ActionConfirmingDialog
        open={isRemoveFromListDialogOpen}
        setOpen={setIsRemoveFromListDialogOpen}
        title={"Remove Bookmarks from List"}
        description={
          <p>
            Are you sure you want to remove {selectedBookmarks.length} bookmarks
            from this list?
          </p>
        }
        actionButton={() => (
          <ActionButton
            type="button"
            variant="destructive"
            loading={removeBookmarkFromListMutator.isPending}
            onClick={() => removeBookmarksFromList()}
          >
            {t("actions.remove")}
          </ActionButton>
        )}
      />
      <BulkManageListsModal
        bookmarkIds={selectedBookmarks.map((b) => b.id)}
        open={manageListsModal}
        setOpen={setManageListsModalOpen}
      />
      <BulkTagModal
        bookmarkIds={selectedBookmarks.map((b) => b.id)}
        open={bulkTagModal}
        setOpen={setBulkTagModalOpen}
      />
      <div className="flex items-center">
        {actionList.map(
          ({ name, icon: Icon, action, isPending, hidden, alwaysEnable }) => (
            <ActionButtonWithTooltip
              className={hidden ? "hidden" : "block"}
              tooltip={name}
              disabled={!selectedBookmarks.length && !alwaysEnable}
              delayDuration={100}
              loading={!!isPending}
              variant="ghost"
              key={name}
              onClick={action}
            >
              {Icon}
            </ActionButtonWithTooltip>
          ),
        )}
      </div>
    </div>
  );
}
