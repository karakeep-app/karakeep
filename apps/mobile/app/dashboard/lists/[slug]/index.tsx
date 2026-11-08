import { Alert, Platform, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { AppIcon } from "@/components/ui/AppIcon";
import { useBookmarkListLayoutMenu } from "@/components/bookmarks/BookmarkListHeader";
import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import { useCommonActions, useTranslation } from "@/lib/i18n/hooks";
import QueryPageState from "@/components/QueryPageState";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { useToast } from "@/components/ui/Toast";
import { useArchiveFilter } from "@/lib/hooks";
import {
  setListKeptOffline,
  useOfflineDownloadPrefs,
} from "@/lib/offlineDownloadPrefs";
import { getOfflineLibraryScope } from "@/lib/offlineLibrary";
import { inlineMenuGroup } from "@/lib/menuGroups";
import useAppSettings from "@/lib/settings";
import { useColorScheme } from "@/lib/useColorScheme";
import { useMenuIconColors } from "@/lib/useMenuIconColors";
import { MenuView } from "@react-native-menu/menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ellipsis, FolderOpen, ListFilter } from "lucide-react-native";

import { useDeleteBookmarkList } from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZBookmarkList } from "@karakeep/shared/types/lists";

export default function ListView() {
  const { slug } = useLocalSearchParams();
  const { t } = useTranslation();
  const api = useTRPC();
  if (typeof slug !== "string") {
    throw new Error("Unexpected param type");
  }
  const {
    data: list,
    error,
    refetch,
  } = useQuery(api.lists.get.queryOptions({ listId: slug }));
  const { archived, isLoading: isSettingsLoading } = useArchiveFilter();

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: list ? `${list.icon} ${list.name}` : "",
          // Long list names overflow the large title otherwise.
          headerLargeTitle: (list?.name.length ?? 0) <= 18,
          headerRight: () => (
            <ListActionsMenu
              listId={slug}
              name={list?.name}
              canAdd={canAddBookmarks(list)}
              role={list?.userRole ?? "viewer"}
              isLoaded={!!list}
            />
          ),
        }}
      />
      {!list ? (
        <QueryPageState error={error} onRetry={() => refetch()} />
      ) : !isSettingsLoading ? (
        <UpdatingBookmarkList
          query={{
            listId: list.id,
            archived,
          }}
          emptyState={
            list.type === "smart"
              ? {
                  icon: ListFilter,
                  title: t("lists.smart_empty_title"),
                  subtitle: t("lists.smart_empty_subtitle", {
                    query: list.query,
                  }),
                  ...(list.userRole === "owner" && {
                    actionLabel: t("lists.edit_search"),
                    onAction: () =>
                      router.push(`/dashboard/lists/${list.id}/edit`),
                  }),
                }
              : {
                  icon: FolderOpen,
                  title: t("lists.empty_title"),
                  subtitle: t("lists.empty_subtitle"),
                  ...(canAddBookmarks(list) && {
                    actionLabel: t("lists.add_bookmarks"),
                    onAction: () =>
                      router.push(`/dashboard/lists/${list.id}/add`),
                  }),
                }
          }
        />
      ) : (
        <FullPageSpinner />
      )}
    </>
  );
}

function canAddBookmarks(list?: ZBookmarkList) {
  return (
    list?.type === "manual" &&
    (list.userRole === "owner" || list.userRole === "editor")
  );
}

/** The list is gone, so leave its screen rather than rendering a dead route. */
function leaveListScreen() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/dashboard/(tabs)/(lists)");
  }
}

function ListActionsMenu({
  listId,
  name,
  canAdd,
  role,
  isLoaded,
}: {
  listId: string;
  name?: string;
  canAdd: boolean;
  role: ZBookmarkList["userRole"];
  isLoaded: boolean;
}) {
  const api = useTRPC();
  const { colors } = useColorScheme();
  const { t } = useTranslation();
  const actions = useCommonActions();
  const { menuIconColor, destructiveMenuIconColor } = useMenuIconColors();
  const { layoutActions, handleLayoutAction } = useBookmarkListLayoutMenu();
  const { settings } = useAppSettings();
  const { toast } = useToast();
  const offlineScope = getOfflineLibraryScope(settings);
  const keptOffline =
    useOfflineDownloadPrefs(offlineScope).listIds.includes(listId);
  const { mutate: deleteList } = useDeleteBookmarkList({
    onSuccess: leaveListScreen,
  });

  const queryClient = useQueryClient();
  const { mutate: leaveList } = useMutation(
    api.lists.leaveList.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(api.lists.list.pathFilter());
        leaveListScreen();
      },
    }),
  );

  const handleDelete = () => {
    Alert.alert(
      name
        ? t("lists.delete_named_title", { name })
        : t("lists.delete_title_question"),
      t("lists.delete_keeps_bookmarks"),
      [
        { text: actions.cancel, style: "cancel" },
        {
          text: actions.delete,
          onPress: () => {
            deleteList({ listId });
          },
          style: "destructive",
        },
      ],
    );
  };

  const handleLeave = () => {
    Alert.alert(
      name
        ? t("lists.leave_named_title", { name })
        : t("lists.leave_title_question"),
      t("lists.leave_lose_access"),
      [
        { text: actions.cancel, style: "cancel" },
        {
          text: t("lists.leave"),
          onPress: () => {
            leaveList({ listId });
          },
          style: "destructive",
        },
      ],
    );
  };

  const handleEdit = () => {
    router.push({
      pathname: "/dashboard/lists/[slug]/edit",
      params: { slug: listId },
    });
  };

  return (
    <MenuView
      actions={[
        ...inlineMenuGroup("manage-group", [
          {
            id: "add_bookmarks",
            title: t("lists.add_bookmarks"),
            attributes: { hidden: !canAdd },
            image: Platform.select({ ios: "plus" }),
            imageColor: Platform.select({ ios: menuIconColor }),
          },
          {
            id: "keep_offline",
            // Android menus don't show the checkmark, so say it in the title.
            title:
              Platform.OS === "ios" || !keptOffline
                ? t("lists.download_list")
                : t("lists.remove_download"),
            state: keptOffline ? "on" : "off",
            // Until the list loads, the slug may not name a list we can read.
            attributes: { hidden: !isLoaded },
            image: Platform.select({
              ios: "arrow.down.circle",
            }),
            imageColor: Platform.select({
              ios: menuIconColor,
            }),
          },
          {
            id: "edit",
            title: t("lists.edit_list"),
            attributes: {
              hidden: !isLoaded || role !== "owner",
            },
            image: Platform.select({
              ios: "square.and.pencil",
            }),
            imageColor: Platform.select({
              ios: menuIconColor,
            }),
          },
          {
            id: "sharing",
            title:
              role === "owner"
                ? t("list_sharing.title")
                : t("list_sharing.people_with_access"),
            attributes: { hidden: !isLoaded || role === "public" },
            image: Platform.select({ ios: "person.2" }),
            imageColor: Platform.select({ ios: menuIconColor }),
          },
        ]),
        ...inlineMenuGroup("view-group", layoutActions),
        {
          id: "delete_list",
          title: t("lists.delete_list"),
          attributes: {
            destructive: true,
            hidden: !isLoaded || role !== "owner",
          },
          image: Platform.select({
            ios: "trash",
          }),
          imageColor: Platform.select({
            ios: destructiveMenuIconColor,
          }),
        },
        {
          id: "leave",
          title: t("lists.leave_list"),
          attributes: {
            destructive: true,
            hidden: !isLoaded || role === "owner",
          },
          image: Platform.select({
            ios: "arrowshape.turn.up.left",
          }),
          imageColor: Platform.select({
            ios: destructiveMenuIconColor,
          }),
        },
      ]}
      onPressAction={({ nativeEvent }) => {
        if (handleLayoutAction(nativeEvent.event)) {
          return;
        }

        if (nativeEvent.event === "add_bookmarks") {
          router.push(`/dashboard/lists/${listId}/add`);
        } else if (nativeEvent.event === "keep_offline") {
          setListKeptOffline(offlineScope, listId, !keptOffline);
          toast({
            message: keptOffline
              ? t("lists.download_stopped")
              : t("lists.download_started"),
            showProgress: false,
          });
        } else if (nativeEvent.event === "delete_list") {
          handleDelete();
        } else if (nativeEvent.event === "leave") {
          handleLeave();
        } else if (nativeEvent.event === "sharing") {
          router.push(`/dashboard/lists/${listId}/sharing`);
        } else if (nativeEvent.event === "edit") {
          handleEdit();
        }
      }}
      shouldOpenOnLongPress={false}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("lists.list_actions")}
        className="my-auto"
        hitSlop={8}
        onPress={() => void Haptics.selectionAsync()}
      >
        <AppIcon icon={Ellipsis} size={21} color={colors.foreground} />
      </Pressable>
    </MenuView>
  );
}
