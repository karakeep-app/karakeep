"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useClientConfig } from "@/lib/clientConfig";
import useUpload from "@/lib/hooks/upload-file";
import { useTranslation } from "@/lib/i18n/client";
import {
  Archive,
  Download,
  FileDown,
  FileText,
  ImagePlus,
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
import { toast } from "sonner";

import type {
  ZBookmark,
  ZBookmarkedLink,
} from "@karakeep/shared/types/bookmarks";
import {
  useAttachBookmarkAsset,
  useReplaceBookmarkAsset,
} from "@karakeep/shared-react/hooks/assets";
import { useBookmarkGridContext } from "@karakeep/shared-react/hooks/bookmark-grid-context";
import { useBookmarkListContext } from "@karakeep/shared-react/hooks/bookmark-list-context";
import {
  useRecrawlBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { useRemoveBookmarkFromList } from "@karakeep/shared-react/hooks/lists";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

import { BookmarkedTextEditor } from "./BookmarkedTextEditor";
import DeleteBookmarkConfirmationDialog from "./DeleteBookmarkConfirmationDialog";
import { EditBookmarkDialog } from "./EditBookmarkDialog";
import { ArchivedActionIcon, FavouritedActionIcon } from "./icons";
import { useManageListsModal } from "./ManageListsModal";

interface ActionItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  visible: boolean;
  disabled: boolean;
  className?: string;
  onClick: () => void;
}

interface SubsectionItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  visible: boolean;
  items: ActionItem[];
}

const getBannerSonnerId = (bookmarkId: string) =>
  `replace-banner-${bookmarkId}`;

type ActionItemType = ActionItem | SubsectionItem;

function isSubsectionItem(item: ActionItemType): item is SubsectionItem {
  return "items" in item;
}

export default function BookmarkOptions({ bookmark }: { bookmark: ZBookmark }) {
  const { t } = useTranslation();
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

  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  const { mutate: uploadBannerAsset } = useUpload({
    onError: (e) => {
      toast.error(e.error, { id: getBannerSonnerId(bookmark.id) });
    },
  });

  const { mutate: attachAsset, isPending: isAttaching } =
    useAttachBookmarkAsset({
      onSuccess: () => {
        toast.success(t("toasts.bookmarks.update_banner"), {
          id: getBannerSonnerId(bookmark.id),
        });
      },
      onError: (e) => {
        toast.error(e.message, { id: getBannerSonnerId(bookmark.id) });
      },
    });

  const { mutate: replaceAsset, isPending: isReplacing } =
    useReplaceBookmarkAsset({
      onSuccess: () => {
        toast.success(t("toasts.bookmarks.update_banner"), {
          id: getBannerSonnerId(bookmark.id),
        });
      },
      onError: (e) => {
        toast.error(e.message, { id: getBannerSonnerId(bookmark.id) });
      },
    });

  const { listId } = useBookmarkGridContext() ?? {};
  const withinListContext = useBookmarkListContext();

  const onError = () => {
    toast.error(t("common.something_went_wrong"));
  };

  const updateBookmarkMutator = useUpdateBookmark({
    onSuccess: () => {
      toast.success(t("toasts.bookmarks.updated"));
    },
    onError,
  });

  const crawlBookmarkMutator = useRecrawlBookmark({
    onSuccess: () => {
      toast.success(t("toasts.bookmarks.refetch"));
    },
    onError,
  });

  const fullPageArchiveBookmarkMutator = useRecrawlBookmark({
    onSuccess: () => {
      toast.success(t("toasts.bookmarks.full_page_archive"));
    },
    onError,
  });

  const preservePdfMutator = useRecrawlBookmark({
    onSuccess: () => {
      toast.success(t("toasts.bookmarks.preserve_pdf"));
    },
    onError,
  });

  const removeFromListMutator = useRemoveBookmarkFromList({
    onSuccess: () => {
      toast.success(t("toasts.bookmarks.delete_from_list"));
    },
    onError,
  });

  const handleBannerFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const existingBanner = bookmark.assets.find(
        (asset) => asset.assetType === "bannerImage",
      );

      if (existingBanner) {
        toast.loading(t("toasts.bookmarks.uploading_banner"), {
          id: getBannerSonnerId(bookmark.id),
        });
        uploadBannerAsset(file, {
          onSuccess: (resp) => {
            replaceAsset({
              bookmarkId: bookmark.id,
              oldAssetId: existingBanner.id,
              newAssetId: resp.assetId,
            });
          },
        });
      } else {
        toast.loading(t("toasts.bookmarks.uploading_banner"), {
          id: getBannerSonnerId(bookmark.id),
        });
        uploadBannerAsset(file, {
          onSuccess: (resp) => {
            attachAsset({
              bookmarkId: bookmark.id,
              asset: {
                id: resp.assetId,
                assetType: "bannerImage",
              },
            });
          },
        });
      }
    }
  };

  // Define action items array
  const actionItems: ActionItemType[] = [
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
      id: "copy-link",
      title: t("actions.copy_link"),
      icon: <Link className="mr-2 size-4" />,
      visible: bookmark.content.type === BookmarkTypes.LINK,
      disabled: !isClipboardAvailable,
      onClick: () => {
        navigator.clipboard.writeText(
          (bookmark.content as ZBookmarkedLink).url,
        );
        toast.success(t("toasts.bookmarks.clipboard_copied"));
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
      visible: Boolean(
        (isOwner ||
          (withinListContext &&
            (withinListContext.userRole === "editor" ||
              withinListContext.userRole === "owner"))) &&
          !!listId &&
          !!withinListContext &&
          withinListContext.type === "manual",
      ),
      disabled: demoMode,
      onClick: () =>
        removeFromListMutator.mutate({
          listId: listId!,
          bookmarkId: bookmark.id,
        }),
    },
    {
      id: "offline-copies",
      title: t("actions.offline_copies"),
      icon: <Archive className="mr-2 size-4" />,
      visible: isOwner && bookmark.content.type === BookmarkTypes.LINK,
      items: [
        {
          id: "download-full-page",
          title: t("actions.preserve_offline_archive"),
          icon: <FileDown className="mr-2 size-4" />,
          visible: true,
          disabled: demoMode,
          onClick: () => {
            fullPageArchiveBookmarkMutator.mutate({
              bookmarkId: bookmark.id,
              archiveFullPage: true,
            });
          },
        },
        {
          id: "preserve-pdf",
          title: t("actions.preserve_as_pdf"),
          icon: <FileText className="mr-2 size-4" />,
          visible: true,
          disabled: demoMode,
          onClick: () => {
            preservePdfMutator.mutate({
              bookmarkId: bookmark.id,
              storePdf: true,
            });
          },
        },
        {
          id: "download-full-page-archive",
          title: t("actions.download_full_page_archive_file"),
          icon: <Download className="mr-2 size-4" />,
          visible:
            bookmark.content.type === BookmarkTypes.LINK &&
            !!(
              bookmark.content.fullPageArchiveAssetId ||
              bookmark.content.precrawledArchiveAssetId
            ),
          disabled: false,
          onClick: () => {
            const link = bookmark.content as ZBookmarkedLink;
            const archiveAssetId =
              link.fullPageArchiveAssetId ?? link.precrawledArchiveAssetId;
            if (archiveAssetId) {
              window.open(getAssetUrl(archiveAssetId), "_blank");
            }
          },
        },
        {
          id: "download-pdf",
          title: t("actions.download_pdf_file"),
          icon: <Download className="mr-2 size-4" />,
          visible: !!(bookmark.content as ZBookmarkedLink).pdfAssetId,
          disabled: false,
          onClick: () => {
            const link = bookmark.content as ZBookmarkedLink;
            if (link.pdfAssetId) {
              window.open(getAssetUrl(link.pdfAssetId), "_blank");
            }
          },
        },
      ],
    },
    {
      id: "more",
      title: t("actions.more"),
      icon: <MoreHorizontal className="mr-2 size-4" />,
      visible: isOwner,
      items: [
        {
          id: "refresh",
          title: t("actions.refresh"),
          icon: <RotateCw className="mr-2 size-4" />,
          visible: bookmark.content.type === BookmarkTypes.LINK,
          disabled: demoMode,
          onClick: () =>
            crawlBookmarkMutator.mutate({ bookmarkId: bookmark.id }),
        },
        {
          id: "replace-banner",
          title: bookmark.assets.find((a) => a.assetType === "bannerImage")
            ? t("actions.replace_banner")
            : t("actions.add_banner"),
          icon: <ImagePlus className="mr-2 size-4" />,
          visible: true,
          disabled: demoMode || isAttaching || isReplacing,
          onClick: () => bannerFileInputRef.current?.click(),
        },
      ],
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
  const visibleItems: ActionItemType[] = actionItems.filter((item) => {
    if (isSubsectionItem(item)) {
      return item.visible && item.items.some((subItem) => subItem.visible);
    }
    return item.visible;
  });

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
          {visibleItems.map((item) => {
            if (isSubsectionItem(item)) {
              const visibleSubItems = item.items.filter(
                (subItem) => subItem.visible,
              );
              if (visibleSubItems.length === 0) {
                return null;
              }
              return (
                <DropdownMenuSub key={item.id}>
                  <DropdownMenuSubTrigger>
                    {item.icon}
                    <span>{item.title}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {visibleSubItems.map((subItem) => (
                      <DropdownMenuItem
                        key={subItem.id}
                        disabled={subItem.disabled}
                        onClick={subItem.onClick}
                      >
                        {subItem.icon}
                        <span>{subItem.title}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            }
            return (
              <DropdownMenuItem
                key={item.id}
                disabled={item.disabled}
                className={item.className}
                onClick={item.onClick}
              >
                {item.icon}
                <span>{item.title}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        type="file"
        ref={bannerFileInputRef}
        onChange={handleBannerFileChange}
        className="hidden"
        accept=".jpg,.jpeg,.png,.webp"
      />
    </>
  );
}
