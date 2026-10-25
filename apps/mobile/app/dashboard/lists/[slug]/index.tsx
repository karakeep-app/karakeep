import { Alert, Platform, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useBookmarkListLayoutMenu } from "@/components/bookmarks/BookmarkListHeader";
import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import { useCommonActions, useTranslation } from "@/lib/i18n/hooks";
import QueryPageState from "@/components/QueryPageState";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { useArchiveFilter } from "@/lib/hooks";
import {
  setListKeptOffline,
  useOfflineDownloadPrefs,
} from "@/lib/offlineDownloadPrefs";
import { getOfflineLibraryScope } from "@/lib/offlineLibrary";
import useAppSettings from "@/lib/settings";
import { useColorScheme } from "@/lib/useColorScheme";
import { useMenuIconColors } from "@/lib/useMenuIconColors";
import { MenuView } from "@react-native-menu/menu";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ellipsis } from "lucide-react-native";

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
          headerBackTitle: t("app.back"),
          headerRight: () => (
            <ListActionsMenu
              listId={slug}
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
        />
      ) : (
        <FullPageSpinner />
      )}
    </>
  );
}

function ListActionsMenu({
  listId,
  role,
  isLoaded,
}: {
  listId: string;
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
  const offlineScope = getOfflineLibraryScope(settings);
  const keptOffline =
    useOfflineDownloadPrefs(offlineScope).listIds.includes(listId);
  const { mutate: deleteList } = useMutation(
    api.lists.delete.mutationOptions({
      onSuccess: () => {
        router.replace("/dashboard/lists");
      },
    }),
  );

  const { mutate: leaveList } = useMutation(
    api.lists.leaveList.mutationOptions({
      onSuccess: () => {
        router.replace("/dashboard/lists");
      },
    }),
  );

  const handleDelete = () => {
    Alert.alert(t("lists.delete_title"), t("lists.delete_message"), [
      { text: actions.cancel, style: "cancel" },
      {
        text: t("bookmark_actions.delete"),
        onPress: () => {
          deleteList({ listId });
        },
        style: "destructive",
      },
    ]);
  };

  const handleLeave = () => {
    Alert.alert(t("lists.leave_title"), t("lists.leave_message"), [
      { text: actions.cancel, style: "cancel" },
      {
        text: t("lists.leave"),
        onPress: () => {
          leaveList({ listId });
        },
        style: "destructive",
      },
    ]);
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
        {
          id: "keep_offline",
          // Android menus don't show the checkmark, so say it in the title.
          title:
            Platform.OS === "ios" || !keptOffline
              ? "Keep This List Offline"
              : "Stop Keeping This List Offline",
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
            hidden: role !== "owner",
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
          attributes: { hidden: role === "public" },
          image: Platform.select({ ios: "person.2" }),
          imageColor: Platform.select({ ios: menuIconColor }),
        },
        {
          id: "delete_list",
          title: t("lists.delete_list"),
          attributes: {
            destructive: true,
            hidden: role !== "owner",
          },
          image: Platform.select({
            ios: "trash",
          }),
          imageColor: Platform.select({
            ios: destructiveMenuIconColor,
          }),
        },
        ...layoutActions,
        {
          id: "leave",
          title: t("lists.leave_list"),
          attributes: {
            destructive: true,
            hidden: role === "owner",
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

        if (nativeEvent.event === "keep_offline") {
          setListKeptOffline(offlineScope, listId, !keptOffline);
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
      <View className="my-auto">
        <Ellipsis
          onPress={() => Haptics.selectionAsync()}
          color={colors.foreground}
        />
      </View>
    </MenuView>
  );
}
