"use client";

import { ChangeEvent, Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ButtonWithTooltip } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/auth/client";
import useBulkActionsStore from "@/lib/bulkActions";
import { useClientConfig } from "@/lib/clientConfig";
import useUpload from "@/lib/hooks/upload-file";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  Download,
  FileDown,
  FileText,
  FileVideo,
  HardDriveDownload,
  ImagePlus,
  Link,
  List,
  ListX,
  Maximize2,
  MoreHorizontal,
  Pencil,
  RotateCw,
  Square,
  SquarePen,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import type {
  ZBookmark,
  ZBookmarkedAsset,
  ZBookmarkedLink,
} from "@karakeep/shared/types/bookmarks";
import {
  useAttachBookmarkAsset,
  useReplaceBookmarkAsset,
} from "@karakeep/shared-react/hooks/assets";
import { useBookmarkGridContext } from "@karakeep/shared-react/hooks/bookmark-grid-context";
import { useBookmarkListContext } from "@karakeep/shared-react/hooks/bookmark-list-context";
import {
  usePreserveBookmarkVideo,
  usePreserveOfflineCopy,
  useRecrawlBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { useRemoveBookmarkFromList } from "@karakeep/shared-react/hooks/lists";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";
import { getBookmarkDisplayTitle } from "@karakeep/shared/utils/bookmarkUtils";

import { BOTTOM_SHEET_CLASS } from "../header/toolbarButton";
import { BookmarkedTextEditor } from "./BookmarkedTextEditor";
import DeleteBookmarkConfirmationDialog from "./DeleteBookmarkConfirmationDialog";
import { EditBookmarkDialog } from "./EditBookmarkDialog";
import {
  ArchivedActionIcon,
  CARD_ICON_BUTTON_CLASS,
  FavouritedActionIcon,
} from "./icons";
import { useManageListsModal } from "./ManageListsModal";
import { useTagModal } from "./TagModal";
import { useArchiveBookmarkWithUndo } from "./useArchiveBookmarkWithUndo";

interface ActionItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  visible: boolean;
  disabled: boolean;
  variant?: "destructive";
  // The key that does the same on the grid
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

function SheetAction({
  item,
  onSelect,
}: {
  item: ActionItem;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={item.disabled}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-sm px-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        item.variant === "destructive" &&
          "text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20 [&_svg]:text-destructive",
      )}
      onClick={() => {
        onSelect();
        item.onClick();
      }}
    >
      {item.icon}
      <span className="min-w-0">{item.title}</span>
    </button>
  );
}

/**
 * A phone's card menu, which doesn't fit on the screen as a dropdown: it's opened
 * at the top of the screen, far from its button, with the end of it out of sight.
 * This has every action in reach, with deleting in a fixed place at the end.
 */
function BookmarkOptionsSheet({
  bookmark,
  groups,
  isAnyDialogOpen,
  trigger,
}: {
  bookmark: ZBookmark;
  groups: ActionItemType[][];
  isAnyDialogOpen: boolean;
  trigger: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const isPinned = (item: ActionItemType) => item.id === "delete";
  const pinned = groups.flat().filter(isPinned) as ActionItem[];
  const scrolling = groups
    .map((group) => group.filter((item) => !isPinned(item)))
    .filter((group) => group.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className={BOTTOM_SHEET_CLASS}
        onCloseAutoFocus={(e) => {
          // Stays with the dialog an action has opened
          if (isAnyDialogOpen) {
            e.preventDefault();
          }
        }}
      >
        <DialogTitle className="truncate py-2 pl-2 pr-12 text-base">
          {getBookmarkDisplayTitle(bookmark) ?? t("common.untitled")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("actions.more_options")}
        </DialogDescription>
        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2">
          {scrolling.map((group, i) => (
            <Fragment key={i}>
              {i > 0 && <div className="mx-2 my-1 border-t" />}
              {group.map((item) =>
                isSubsectionItem(item) ? (
                  <Fragment key={item.id}>
                    <h3 className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                      {item.title}
                    </h3>
                    {item.items
                      .filter((subItem) => subItem.visible)
                      .map((subItem) => (
                        <SheetAction
                          key={subItem.id}
                          item={subItem}
                          onSelect={close}
                        />
                      ))}
                  </Fragment>
                ) : (
                  <SheetAction key={item.id} item={item} onSelect={close} />
                ),
              )}
            </Fragment>
          ))}
        </div>
        {pinned.length > 0 && (
          <div className="mt-1 shrink-0 border-t pt-1">
            {pinned.map((item) => (
              <SheetAction key={item.id} item={item} onSelect={close} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function BookmarkOptions({
  bookmark,
  hiddenActions,
  showPreviewAction = false,
  trigger,
}: {
  bookmark: ZBookmark;
  // Ids of top-level actions to leave out of the menu
  hiddenActions?: string[];
  // For when clicking the card goes somewhere other than the preview
  showPreviewAction?: boolean;
  trigger?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const isPhone = useMediaQuery("(max-width: 639px)");
  const linkId = bookmark.id;
  const { data: session } = useSession();

  const clientConfig = useClientConfig();
  const demoMode = !!clientConfig.demoMode;

  // Check if the current user owns this bookmark
  const isOwner = session?.user?.id === bookmark.userId;
  const enableBulkEditForBookmark = useBulkActionsStore(
    (state) => state.enableBulkEditForBookmark,
  );

  const [isClipboardAvailable, setIsClipboardAvailable] = useState(false);

  useEffect(() => {
    // This code only runs in the browser
    setIsClipboardAvailable(
      typeof window !== "undefined" &&
        window.navigator &&
        !!window.navigator.clipboard,
    );
  }, []);

  const {
    open: isManageListsModalOpen,
    setOpen: setManageListsModalOpen,
    content: manageListsModal,
  } = useManageListsModal(bookmark.id);

  const {
    open: isTagModalOpen,
    setOpen: setTagModalOpen,
    content: tagModal,
  } = useTagModal(bookmark);

  const [deleteBookmarkDialogOpen, setDeleteBookmarkDialogOpen] =
    useState(false);
  const [isTextEditorOpen, setTextEditorOpen] = useState(false);
  const [isEditBookmarkDialogOpen, setEditBookmarkDialogOpen] = useState(false);
  const isAnyDialogOpen =
    isManageListsModalOpen ||
    isTagModalOpen ||
    deleteBookmarkDialogOpen ||
    isTextEditorOpen ||
    isEditBookmarkDialogOpen;

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

  // Only toggles the favourite, and the star itself shows the result
  const updateBookmarkMutator = useUpdateBookmark({ onError });

  const { setArchived } = useArchiveBookmarkWithUndo();

  const crawlBookmarkMutator = useRecrawlBookmark({
    onSuccess: () => {
      toast.success(t("toasts.bookmarks.refetch"));
    },
    onError,
  });

  const fullPageArchiveBookmarkMutator = usePreserveOfflineCopy({
    onSuccess: () => {
      toast.success(t("toasts.bookmarks.full_page_archive"));
    },
    onError,
  });

  const preservePdfMutator = usePreserveOfflineCopy({
    onSuccess: () => {
      toast.success(t("toasts.bookmarks.preserve_pdf"));
    },
    onError,
  });

  const preserveVideoMutator = usePreserveBookmarkVideo({
    onSuccess: () => {
      toast.success(t("toasts.bookmarks.preserve_video"));
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

  const recrawlAction: ActionItem = {
    id: "refresh",
    title: t("actions.recrawl"),
    icon: <RotateCw className="size-4" />,
    visible: isOwner && bookmark.content.type === BookmarkTypes.LINK,
    disabled: demoMode,
    onClick: () => crawlBookmarkMutator.mutate({ bookmarkId: bookmark.id }),
  };
  // It's the first thing to try on a page that couldn't be fetched
  const hasCrawlFailed =
    bookmark.content.type === BookmarkTypes.LINK &&
    bookmark.content.crawlStatus === "failure";

  // Define action items array
  const actionGroups: ActionItemType[][] = [
    [
      ...(hasCrawlFailed ? [recrawlAction] : []),
      {
        id: "preview",
        title: t("actions.preview"),
        icon: <Maximize2 className="size-4" />,
        visible: showPreviewAction,
        disabled: false,
        onClick: () => router.push(`/dashboard/preview/${bookmark.id}`),
      },
      {
        id: "select",
        title: t("actions.select"),
        icon: <Square className="size-4" />,
        // Phones and keyboards don't get the hover toolbar it's also on
        visible: isOwner,
        disabled: false,
        onClick: () => enableBulkEditForBookmark(bookmark.id),
      },
      {
        id: "edit",
        title: t("actions.edit_details"),
        icon: <Pencil className="size-4" />,
        visible: isOwner,
        disabled: false,
        onClick: () => setEditBookmarkDialogOpen(true),
      },
      {
        id: "edit-tags",
        title: t("actions.edit_tags"),
        icon: <Tag className="size-4" />,
        visible: isOwner,
        disabled: demoMode,
        onClick: () => setTagModalOpen(true),
      },
      {
        id: "open-editor",
        title: t("actions.edit_note"),
        icon: <SquarePen className="size-4" />,
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
            className="size-4"
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
        title: bookmark.archived
          ? t("actions.unarchive")
          : t("actions.archive"),
        icon: (
          <ArchivedActionIcon className="size-4" archived={bookmark.archived} />
        ),
        visible: isOwner,
        disabled: demoMode,
        onClick: () => setArchived(linkId, !bookmark.archived),
      },
    ],
    [
      {
        id: "copy-link",
        title: t("actions.copy_link"),
        icon: <Link className="size-4" />,
        visible: bookmark.content.type === BookmarkTypes.LINK,
        disabled: !isClipboardAvailable,
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(
              (bookmark.content as ZBookmarkedLink).url,
            );
            toast.success(t("toasts.bookmarks.clipboard_copied"));
          } catch {
            toast.error(t("toasts.bookmarks.clipboard_failed"));
          }
        },
      },
      {
        id: "manage-lists",
        title: t("actions.manage_lists"),
        icon: <List className="size-4" />,
        visible: isOwner,
        disabled: false,
        onClick: () => setManageListsModalOpen(true),
      },
      {
        id: "remove-from-list",
        title: t("actions.remove_from_list"),
        icon: <ListX className="size-4" />,
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
    ],
    [
      {
        id: "offline-copies",
        title: t("actions.offline_copies"),
        icon: <HardDriveDownload className="size-4" />,
        visible: isOwner && bookmark.content.type === BookmarkTypes.LINK,
        items: [
          {
            id: "download-full-page",
            title: t("actions.preserve_offline_archive"),
            icon: <FileDown className="size-4" />,
            visible: true,
            disabled: demoMode,
            onClick: () => {
              fullPageArchiveBookmarkMutator.mutate({
                bookmarkId: bookmark.id,
                kind: "fullPageArchive",
              });
            },
          },
          {
            id: "preserve-pdf",
            title: t("actions.preserve_as_pdf"),
            icon: <FileText className="size-4" />,
            visible: true,
            disabled: demoMode,
            onClick: () => {
              preservePdfMutator.mutate({
                bookmarkId: bookmark.id,
                kind: "pdf",
              });
            },
          },
          {
            id: "preserve-video",
            title: t("actions.preserve_video"),
            icon: <FileVideo className="size-4" />,
            visible: clientConfig.crawler.videoDownloadOnDemand,
            disabled: demoMode,
            onClick: () => {
              preserveVideoMutator.mutate({ bookmarkId: bookmark.id });
            },
          },
          {
            id: "download-full-page-archive",
            title: t("actions.download_full_page_archive_file"),
            icon: <Download className="size-4" />,
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
            icon: <Download className="size-4" />,
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
      ...(hasCrawlFailed ? [] : [recrawlAction]),
      {
        id: "download-asset",
        title: t("actions.download"),
        icon: <Download className="size-4" />,
        visible: isOwner && bookmark.content.type === BookmarkTypes.ASSET,
        disabled: false,
        onClick: () => {
          const asset = bookmark.content as ZBookmarkedAsset;
          window.open(getAssetUrl(asset.assetId), "_blank");
        },
      },
      {
        id: "replace-banner",
        title: bookmark.assets.find((a) => a.assetType === "bannerImage")
          ? t("actions.replace_banner")
          : t("actions.add_banner"),
        icon: <ImagePlus className="size-4" />,
        visible: isOwner,
        disabled: demoMode || isAttaching || isReplacing,
        onClick: () => bannerFileInputRef.current?.click(),
      },
    ],
    [
      {
        id: "delete",
        title: t("actions.delete"),
        icon: <Trash2 className="size-4" />,
        visible: isOwner,
        disabled: demoMode,
        variant: "destructive",
        onClick: () => setDeleteBookmarkDialogOpen(true),
      },
    ],
  ];

  const visibleGroups = actionGroups
    .map((group) =>
      group.filter((item) => {
        if (hiddenActions?.includes(item.id)) {
          return false;
        }
        if (isSubsectionItem(item)) {
          return item.visible && item.items.some((subItem) => subItem.visible);
        }
        return item.visible;
      }),
    )
    .filter((group) => group.length > 0);

  // If no items are visible, don't render the dropdown
  if (visibleGroups.length === 0) {
    return null;
  }

  const menuTrigger = trigger ?? (
    <ButtonWithTooltip
      tooltip={t("actions.more_options")}
      delayDuration={300}
      aria-label={t("actions.more_options")}
      variant="ghost"
      size="none"
      className={CARD_ICON_BUTTON_CLASS}
    >
      <MoreHorizontal className="size-4" />
    </ButtonWithTooltip>
  );

  return (
    <>
      {manageListsModal}
      {tagModal}
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
      {isPhone ? (
        <BookmarkOptionsSheet
          bookmark={bookmark}
          groups={visibleGroups}
          isAnyDialogOpen={isAnyDialogOpen}
          trigger={menuTrigger}
        />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{menuTrigger}</DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-44"
            onCloseAutoFocus={(e) => {
              // The menu restores focus to its trigger once its close animation
              // ends. If an item opened a dialog, that steals focus from the
              // dialog and dismisses any popover opened inside it in the meantime.
              if (isAnyDialogOpen) {
                e.preventDefault();
              }
            }}
          >
            {visibleGroups.map((group, i) => (
              <Fragment key={i}>
                {i > 0 && <DropdownMenuSeparator />}
                {group.map((item) => {
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
                      variant={item.variant}
                      onClick={item.onClick}
                      // An item takes the focus back to the menu when the pointer
                      // leaves it, as it does for a dialog's overlay coming up under
                      // it. That would take it away from the dialog.
                      onPointerLeave={(e) => {
                        if (isAnyDialogOpen) {
                          e.preventDefault();
                        }
                      }}
                    >
                      {item.icon}
                      <span>{item.title}</span>
                      {/* A custom trigger's outside of the grid, like the preview's */}
                    </DropdownMenuItem>
                  );
                })}
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
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
