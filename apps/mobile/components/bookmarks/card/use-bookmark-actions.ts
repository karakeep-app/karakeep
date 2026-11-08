import { useOfflineAvailability } from "@/components/bookmarks/useOfflineAvailability";
import { getBookmarkDisplayTitle } from "@/lib/bookmarkDisplay";
import useAppSettings from "@/lib/settings";
import { shareBookmark } from "@/lib/shareBookmark";
import { useMenuIconColors } from "@/lib/useMenuIconColors";
import type { MenuAction } from "@react-native-menu/menu";
import { router } from "expo-router";
import { Alert, Platform } from "react-native";

import {
  useDeleteBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import {
  useCommonActions,
  useCommonStrings,
  useTranslation,
} from "@/lib/i18n/hooks";
import { showUndoToast, useToast } from "../../ui/Toast";

export interface BookmarkActionController {
  isOwner: boolean;
  isBusy: boolean;
  isFavourited: boolean;
  menuActions: MenuAction[];
  /** The overflow actions, plus the ones the card row doesn't show. */
  contextMenuActions: MenuAction[];
  handleAction: (actionId: string) => void;
  share: () => void;
  toggleFavourite: () => void;
  isArchived: boolean;
  isAvailableOffline: boolean;
  toggleArchived: () => void;
}

export function useBookmarkActions(
  bookmark: ZBookmark,
  isOwner: boolean,
): BookmarkActionController {
  const { toast } = useToast();
  const { t } = useTranslation();
  const actions = useCommonActions();
  const strings = useCommonStrings();
  const { settings } = useAppSettings();
  const { menuIconColor, destructiveMenuIconColor } = useMenuIconColors();
  const offlineAvailability = useOfflineAvailability(bookmark.id);
  const supportsOfflineReading =
    bookmark.content.type === BookmarkTypes.LINK ||
    bookmark.content.type === BookmarkTypes.TEXT;

  const onError = () => {
    toast({
      message: strings.somethingWentWrong,
      variant: "destructive",
      showProgress: false,
    });
  };

  const { mutate: deleteBookmark, isPending: isDeletionPending } =
    useDeleteBookmark({
      onSuccess: () => {
        toast({
          message: t("bookmark_actions.bookmark_deleted"),
          variant: "success",
          showProgress: false,
        });
      },
      onError,
    });

  const { mutate: favouriteBookmark, variables } = useUpdateBookmark({
    onError,
  });

  const { mutate: archiveBookmark, isPending: isArchivePending } =
    useUpdateBookmark({
      onSuccess: (response) => {
        showUndoToast(
          response.archived
            ? t("bookmarks.archived")
            : t("bookmark_actions.moved_out_of_archive"),
          () =>
            archiveBookmark({
              bookmarkId: bookmark.id,
              archived: !response.archived,
            }),
        );
      },
      onError,
    });

  const isFavourited = Boolean(
    variables ? variables.favourited : bookmark.favourited,
  );

  const toggleFavourite = () => {
    favouriteBookmark({
      bookmarkId: bookmark.id,
      favourited: !bookmark.favourited,
    });
  };

  const share = () => shareBookmark(bookmark, settings, toast);

  const deleteBookmarkAlert = () =>
    Alert.alert(
      t("bookmark_actions.delete_named_title", {
        title: getBookmarkDisplayTitle(bookmark),
      }),
      t("bookmark_actions.delete_named_message"),
      [
        { text: actions.cancel, style: "cancel" },
        {
          text: t("bookmark_actions.delete"),
          onPress: () => deleteBookmark({ bookmarkId: bookmark.id }),
          style: "destructive",
        },
      ],
    );

  const menuActions: MenuAction[] = [];
  if (isOwner) {
    menuActions.push(
      {
        id: "edit",
        title: t("bookmark_actions.edit_details"),
        image: Platform.select({ ios: "pencil" }),
        imageColor: Platform.select({ ios: menuIconColor }),
      },
      {
        id: "manage_list",
        title: t("bookmark_actions.manage_lists"),
        image: Platform.select({ ios: "list.bullet" }),
        imageColor: Platform.select({ ios: menuIconColor }),
      },
      {
        id: "manage_tags",
        title: t("bookmark_actions.manage_tags"),
        image: Platform.select({ ios: "tag" }),
        imageColor: Platform.select({ ios: menuIconColor }),
      },
      {
        id: "archive",
        title: bookmark.archived
          ? t("bookmark_actions.move_out_of_archive")
          : t("bookmark_actions.archive"),
        image: Platform.select({ ios: "archivebox" }),
        imageColor: Platform.select({ ios: menuIconColor }),
      },
    );
  }

  if (supportsOfflineReading) {
    if (offlineAvailability.isAvailableOffline) {
      menuActions.push({
        id: "offline-group",
        title: t("bookmark_actions.downloaded"),
        image: Platform.select({ ios: "checkmark.circle" }),
        imageColor: Platform.select({ ios: menuIconColor }),
        subactions: [
          {
            id: "update-offline-copy",
            title: offlineAvailability.isSaving
              ? t("bookmark_actions.downloading")
              : t("bookmark_actions.update_download"),
            image: Platform.select({ ios: "arrow.clockwise" }),
            imageColor: Platform.select({ ios: menuIconColor }),
            attributes: {
              ...(offlineAvailability.isSaving && { disabled: true }),
            },
          },
          {
            id: "remove-offline-copy",
            title: t("bookmark_actions.remove_download"),
            attributes: { destructive: true },
            image: Platform.select({ ios: "trash" }),
            imageColor: Platform.select({ ios: destructiveMenuIconColor }),
          },
        ],
      });
    } else {
      menuActions.push({
        id: "make-available-offline",
        title: offlineAvailability.isSaving
          ? t("bookmark_actions.downloading")
          : t("bookmark_actions.download"),
        image: Platform.select({ ios: "arrow.down.circle" }),
        imageColor: Platform.select({ ios: menuIconColor }),
        attributes: {
          ...(offlineAvailability.isSaving && { disabled: true }),
        },
      });
    }
  }

  if (isOwner) {
    menuActions.push({
      id: "delete",
      title: t("bookmark_actions.delete"),
      attributes: { destructive: true },
      image: Platform.select({ ios: "trash" }),
      imageColor: Platform.select({ ios: destructiveMenuIconColor }),
    });
  }

  const contextMenuActions: MenuAction[] = [
    ...(isOwner
      ? [
          {
            id: "toggle-favourite",
            title: isFavourited
              ? t("bookmark_actions.remove_from_favourites")
              : t("bookmark_actions.add_to_favourites"),
            image: Platform.select({
              ios: isFavourited ? "star.fill" : "star",
            }),
            imageColor: Platform.select({ ios: menuIconColor }),
          },
        ]
      : []),
    {
      id: "share",
      title: t("bookmark_actions.share"),
      image: Platform.select({ ios: "square.and.arrow.up" }),
      imageColor: Platform.select({ ios: menuIconColor }),
    },
    ...menuActions,
  ];

  const handleAction = (actionId: string) => {
    if (actionId === "toggle-favourite") {
      toggleFavourite();
    } else if (actionId === "share") {
      share();
    } else if (
      actionId === "make-available-offline" ||
      actionId === "update-offline-copy"
    ) {
      void offlineAvailability.save();
    } else if (actionId === "remove-offline-copy") {
      offlineAvailability.confirmRemove();
    } else if (actionId === "delete") {
      deleteBookmarkAlert();
    } else if (actionId === "archive") {
      archiveBookmark({
        bookmarkId: bookmark.id,
        archived: !bookmark.archived,
      });
    } else if (actionId === "manage_list") {
      router.push(`/dashboard/bookmarks/${bookmark.id}/manage_lists`);
    } else if (actionId === "manage_tags") {
      router.push(`/dashboard/bookmarks/${bookmark.id}/manage_tags`);
    } else if (actionId === "edit") {
      router.push(`/dashboard/bookmarks/${bookmark.id}/info`);
    }
  };

  return {
    isOwner,
    isBusy: isArchivePending || isDeletionPending,
    isFavourited,
    menuActions,
    contextMenuActions,
    handleAction,
    share,
    toggleFavourite,
    isArchived: bookmark.archived,
    isAvailableOffline: offlineAvailability.isAvailableOffline,
    toggleArchived: () =>
      archiveBookmark({
        bookmarkId: bookmark.id,
        archived: !bookmark.archived,
      }),
  };
}
