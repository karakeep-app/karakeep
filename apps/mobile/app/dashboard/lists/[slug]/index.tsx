import { Alert, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import FullPageError from "@/components/FullPageError";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { useArchiveFilter } from "@/lib/hooks";
import { MenuView } from "@react-native-menu/menu";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ellipsis } from "lucide-react-native";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZBookmarkList } from "@karakeep/shared/types/lists";

export default function ListView() {
  const { slug } = useLocalSearchParams();
  const api = useTRPC();
  if (typeof slug !== "string") {
    throw new Error("Unexpected param type");
  }
  const {
    data: list,
    error,
    refetch,
  } = useQuery(api.lists.get.queryOptions({ listId: slug }));
  const archived = useArchiveFilter();

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: list ? `${list.icon} ${list.name}` : "",
          headerBackTitle: "Back",
          headerRight: () => (
            <ListActionsMenu listId={slug} role={list?.userRole ?? "viewer"} />
          ),
        }}
      />
      {error ? (
        <FullPageError error={error.message} onRetry={() => refetch()} />
      ) : list ? (
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
}: {
  listId: string;
  role: ZBookmarkList["userRole"];
}) {
  const api = useTRPC();
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
          id: "edit",
          title: "Edit List",
          attributes: {
            hidden: role !== "owner",
          },
        },
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
        } else if (nativeEvent.event === "leave") {
          handleLeave();
        } else if (nativeEvent.event === "edit") {
          handleEdit();
        }
      }}
      shouldOpenOnLongPress={false}
    >
      <Ellipsis onPress={() => Haptics.selectionAsync()} color="gray" />
    </MenuView>
  );
}
