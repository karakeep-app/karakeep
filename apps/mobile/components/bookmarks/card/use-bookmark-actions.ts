import { useOfflineAvailability } from "@/components/bookmarks/useOfflineAvailability";
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

import { useToast } from "../../ui/Toast";

export interface BookmarkActionController {
  isOwner: boolean;
  isBusy: boolean;
  isFavourited: boolean;
  menuActions: MenuAction[];
  handleAction: (actionId: string) => void;
  share: () => void;
  toggleFavourite: () => void;
}

export function useBookmarkActions(
  bookmark: ZBookmark,
  isOwner: boolean,
): BookmarkActionController {
  const { toast } = useToast();
  const { settings } = useAppSettings();
  const { menuIconColor, destructiveMenuIconColor } = useMenuIconColors();
  const offlineAvailability = useOfflineAvailability(bookmark.id);
  const supportsOfflineReading =
    bookmark.content.type === BookmarkTypes.LINK ||
    bookmark.content.type === BookmarkTypes.TEXT;

  const onError = () => {
    toast({
      message: "Something went wrong",
      variant: "destructive",
      showProgress: false,
    });
  };

  const { mutate: deleteBookmark, isPending: isDeletionPending } =
    useDeleteBookmark({
      onSuccess: () => {
        toast({
          message: "The bookmark has been deleted!",
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
        toast({
          message: `The bookmark has been ${response.archived ? "archived" : "un-archived"}!`,
          showProgress: false,
        });
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
      "Delete bookmark?",
      "Are you sure you want to delete this bookmark?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
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
        title: "Edit",
        image: Platform.select({ ios: "pencil" }),
        imageColor: Platform.select({ ios: menuIconColor }),
      },
      {
        id: "manage_list",
        title: "Manage Lists",
        image: Platform.select({ ios: "list.bullet" }),
        imageColor: Platform.select({ ios: menuIconColor }),
      },
      {
        id: "manage_tags",
        title: "Manage Tags",
        image: Platform.select({ ios: "tag" }),
        imageColor: Platform.select({ ios: menuIconColor }),
      },
      {
        id: "archive",
        title: bookmark.archived ? "Un-archive" : "Archive",
        image: Platform.select({ ios: "archivebox" }),
        imageColor: Platform.select({ ios: menuIconColor }),
      },
    );
  }

  if (supportsOfflineReading) {
    if (offlineAvailability.isAvailableOffline) {
      menuActions.push({
        id: "offline-group",
        title: "Available offline",
        image: Platform.select({ ios: "checkmark.circle" }),
        imageColor: Platform.select({ ios: menuIconColor }),
        subactions: [
          {
            id: "update-offline-copy",
            title: offlineAvailability.isSaving
              ? "Saving offline copy..."
              : "Update offline copy",
            image: Platform.select({ ios: "arrow.clockwise" }),
            imageColor: Platform.select({ ios: menuIconColor }),
            attributes: {
              ...(offlineAvailability.isSaving && { disabled: true }),
            },
          },
          {
            id: "remove-offline-copy",
            title: "Remove offline copy",
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
          ? "Saving offline copy..."
          : "Make available offline",
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
      title: "Delete",
      attributes: { destructive: true },
      image: Platform.select({ ios: "trash" }),
      imageColor: Platform.select({ ios: destructiveMenuIconColor }),
    });
  }

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
    handleAction,
    share,
    toggleFavourite,
  };
}
