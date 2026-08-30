import { Alert, Platform, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useBookmarkListLayoutMenu } from "@/components/bookmarks/BookmarkListHeader";
import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import QueryPageState from "@/components/QueryPageState";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { useToast } from "@/components/ui/Toast";
import { useArchiveFilter } from "@/lib/hooks";
import { useColorScheme } from "@/lib/useColorScheme";
import { useMenuIconColors } from "@/lib/useMenuIconColors";
import { MenuView } from "@react-native-menu/menu";
import { useQuery } from "@tanstack/react-query";
import { Ellipsis } from "lucide-react-native";

import { useDeleteTag } from "@karakeep/shared-react/hooks/tags";
import { useTRPC } from "@karakeep/shared-react/trpc";

export default function TagView() {
  const { slug } = useLocalSearchParams();
  const api = useTRPC();
  if (typeof slug !== "string") {
    throw new Error("Unexpected param type");
  }

  const {
    data: tag,
    error,
    refetch,
  } = useQuery(api.tags.get.queryOptions({ tagId: slug }));
  const { archived, isLoading: isSettingsLoading } = useArchiveFilter();

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: tag?.name ?? "",
          headerBackTitle: "Back",
          headerRight: () =>
            tag ? <TagActionsMenu tagId={tag.id} tagName={tag.name} /> : null,
        }}
      />
      {!tag ? (
        <QueryPageState error={error} onRetry={() => refetch()} />
      ) : !isSettingsLoading ? (
        <UpdatingBookmarkList
          query={{
            tagId: tag.id,
            archived,
          }}
        />
      ) : (
        <FullPageSpinner />
      )}
    </>
  );
}

function TagActionsMenu({
  tagId,
  tagName,
}: {
  tagId: string;
  tagName: string;
}) {
  const { colors } = useColorScheme();
  const { menuIconColor, destructiveMenuIconColor } = useMenuIconColors();
  const { layoutActions, handleLayoutAction } = useBookmarkListLayoutMenu();
  const { toast } = useToast();
  const { mutate: deleteTag } = useDeleteTag({
    onSuccess: () => {
      router.dismissTo("/dashboard/(tabs)/(tags)");
      toast({ message: `Tag "${tagName}" deleted`, variant: "success" });
    },
    onError: (error) => {
      toast({ message: error.message, variant: "destructive" });
    },
  });

  const handleDelete = () => {
    Alert.alert(
      "Delete Tag",
      `Are you sure you want to delete the tag "${tagName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          onPress: () => deleteTag({ tagId }),
          style: "destructive",
        },
      ],
    );
  };

  const handleEdit = () => {
    router.push({
      pathname: "/dashboard/tags/[slug]/edit",
      params: { slug: tagId },
    });
  };

  return (
    <MenuView
      actions={[
        {
          id: "edit",
          title: "Edit Tag",
          image: Platform.select({ ios: "square.and.pencil" }),
          imageColor: Platform.select({ ios: menuIconColor }),
        },
        {
          id: "delete_tag",
          title: "Delete Tag",
          attributes: { destructive: true },
          image: Platform.select({ ios: "trash" }),
          imageColor: Platform.select({ ios: destructiveMenuIconColor }),
        },
        ...layoutActions,
      ]}
      onPressAction={({ nativeEvent }) => {
        if (handleLayoutAction(nativeEvent.event)) {
          return;
        }

        if (nativeEvent.event === "delete_tag") {
          handleDelete();
        } else if (nativeEvent.event === "edit") {
          handleEdit();
        }
      }}
      shouldOpenOnLongPress={false}
    >
      <View className="my-auto">
        <Ellipsis
          onPress={() => void Haptics.selectionAsync()}
          color={colors.foreground}
        />
      </View>
    </MenuView>
  );
}
