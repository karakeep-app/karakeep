import { Alert, Platform, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import FullPageError from "@/components/FullPageError";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { api } from "@/lib/trpc";
import { MenuView } from "@react-native-menu/menu";
import { Ellipsis } from "lucide-react-native";

import { ZBookmarkList } from "@karakeep/shared/types/lists";

export default function ListView() {
  const { slug } = useLocalSearchParams();
  if (typeof slug !== "string") {
    throw new Error("Unexpected param type");
  }
  const {
    data: list,
    error,
    refetch,
  } = api.lists.get.useQuery({ listId: slug });

  return (
    <CustomSafeAreaView>
      <Stack.Screen
        options={{
          headerTitle: list ? `${list.icon} ${list.name}` : "",
          headerBackTitle: "Back",
          headerLargeTitle: true,
          headerRight: () => (
            <ListActionsMenu listId={slug} role={list?.userRole ?? "viewer"} />
          ),
        }}
      />
      {error ? (
        <FullPageError error={error.message} onRetry={() => refetch()} />
      ) : list ? (
        <View>
          <UpdatingBookmarkList
            query={{
              listId: list.id,
            }}
          />
        </View>
      ) : (
        <FullPageSpinner />
      )}
    </CustomSafeAreaView>
  );
}

function ListActionsMenu({
  listId,
  role,
}: {
  listId: string;
  role: ZBookmarkList["userRole"];
}) {
  const { mutate: deleteList } = api.lists.delete.useMutation({
    onSuccess: () => {
      router.replace("/dashboard/lists");
    },
  });

  const { mutate: leaveList } = api.lists.leaveList.useMutation({
    onSuccess: () => {
      router.replace("/dashboard/lists");
    },
  });

  const handleDelete = () => {
    Alert.alert("Delete List", "Are you sure you want to delete this list?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        onPress: () => {
          deleteList({ listId });
        },
        style: "destructive",
      },
    ]);
  };

  const handleLeave = () => {
    Alert.alert("Leave List", "Are you sure you want to leave this list?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        onPress: () => {
          leaveList({ listId });
        },
        style: "destructive",
      },
    ]);
  };

  return (
    <MenuView
      actions={[
        {
          id: "delete",
          title: "Delete List",
          attributes: {
            destructive: true,
            hidden: role !== "owner",
          },
          image: Platform.select({
            ios: "trash",
          }),
        },
        {
          id: "leave",
          title: "Leave List",
          attributes: {
            destructive: true,
            hidden: role === "owner",
          },
        },
      ]}
      onPressAction={({ nativeEvent }) => {
        if (nativeEvent.event === "delete") {
          handleDelete();
        }
        if (nativeEvent.event === "leave") {
          handleLeave();
        }
      }}
      shouldOpenOnLongPress={false}
    >
      <Ellipsis onPress={() => Haptics.selectionAsync()} color="gray" />
    </MenuView>
  );
}
