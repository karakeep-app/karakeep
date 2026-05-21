import useAppSettings from "@/lib/settings";
import { useMenuIconColors } from "@/lib/useMenuIconColors";
import { MenuView } from "@react-native-menu/menu";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Ellipsis, ShareIcon, Star } from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  View,
} from "react-native";

import {
  useDeleteBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { useWhoAmI } from "@karakeep/shared-react/hooks/users";
import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { useToast } from "../../ui/Toast";
import { shareBookmark } from "@/lib/shareBookmark";

export default function ActionBar({
  bookmark,
  compact = false,
}: {
  bookmark: ZBookmark;
  compact?: boolean;
}) {
  const { toast } = useToast();
  const { settings } = useAppSettings();
  const { data: currentUser } = useWhoAmI();
  const { menuIconColor, destructiveMenuIconColor } = useMenuIconColors();

  // Check if the current user owns this bookmark
  const isOwner = currentUser?.id === bookmark.userId;

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
      onSuccess: (resp) => {
        toast({
          message: `The bookmark has been ${resp.archived ? "archived" : "un-archived"}!`,
          showProgress: false,
        });
      },
      onError,
    });

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

  const handleShare = () => shareBookmark(bookmark, settings, toast);

  // Build actions array based on ownership
  const menuActions = [];
  if (isOwner) {
    menuActions.push(
      {
        id: "edit",
        title: "Edit",
        image: Platform.select({
          ios: "pencil",
        }),
        imageColor: Platform.select({
          ios: menuIconColor,
        }),
      },
      {
        id: "manage_list",
        title: "Manage Lists",
        image: Platform.select({
          ios: "list.bullet",
        }),
        imageColor: Platform.select({
          ios: menuIconColor,
        }),
      },
      {
        id: "manage_tags",
        title: "Manage Tags",
        image: Platform.select({
          ios: "tag",
        }),
        imageColor: Platform.select({
          ios: menuIconColor,
        }),
      },
      {
        id: "archive",
        title: bookmark.archived ? "Un-archive" : "Archive",
        image: Platform.select({
          ios: "folder",
        }),
        imageColor: Platform.select({
          ios: menuIconColor,
        }),
      },
      {
        id: "delete",
        title: "Delete",
        attributes: {
          destructive: true,
        },
        image: Platform.select({
          ios: "trash",
        }),
        imageColor: Platform.select({
          ios: destructiveMenuIconColor,
        }),
      },
    );
  }

  return (
    <View className={compact ? "flex flex-row gap-3" : "flex flex-row gap-4"}>
      {(isArchivePending || isDeletionPending) && <ActivityIndicator />}
      {isOwner && (
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            favouriteBookmark({
              bookmarkId: bookmark.id,
              favourited: !bookmark.favourited,
            });
          }}
        >
          {(variables ? variables.favourited : bookmark.favourited) ? (
            <Star fill="#ebb434" color="#ebb434" size={compact ? 20 : 24} />
          ) : (
            <Star color="gray" size={compact ? 20 : 24} />
          )}
        </Pressable>
      )}

      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          handleShare();
        }}
      >
        <ShareIcon color="gray" size={compact ? 20 : 24} />
      </Pressable>

      {isOwner && menuActions.length > 0 && (
        <MenuView
          onPressAction={({ nativeEvent }) => {
            Haptics.selectionAsync();
            if (nativeEvent.event === "delete") {
              deleteBookmarkAlert();
            } else if (nativeEvent.event === "archive") {
              archiveBookmark({
                bookmarkId: bookmark.id,
                archived: !bookmark.archived,
              });
            } else if (nativeEvent.event === "manage_list") {
              router.push(`/dashboard/bookmarks/${bookmark.id}/manage_lists`);
            } else if (nativeEvent.event === "manage_tags") {
              router.push(`/dashboard/bookmarks/${bookmark.id}/manage_tags`);
            } else if (nativeEvent.event === "edit") {
              router.push(`/dashboard/bookmarks/${bookmark.id}/info`);
            }
          }}
          actions={menuActions}
          shouldOpenOnLongPress={false}
        >
          <Ellipsis
            onPress={() => Haptics.selectionAsync()}
            color="gray"
            size={compact ? 20 : 24}
          />
        </MenuView>
      )}
    </View>
  );
}
