import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import FullPageError from "@/components/FullPageError";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { api } from "@/lib/trpc";

export default function TagView() {
  const { slug } = useLocalSearchParams();
  if (typeof slug !== "string") {
    throw new Error("Unexpected param type");
  }

  const { data: tag, error, refetch } = api.tags.get.useQuery({ tagId: slug });
  const { data: userSettings } = api.users.settings.useQuery();
  const showArchived = userSettings?.archiveDisplayBehaviour === "show";

  return (
    <CustomSafeAreaView>
      <Stack.Screen
        options={{
          headerTitle: tag?.name ?? "",
          headerBackTitle: "Back",
          headerTransparent: true,
          headerLargeTitle: true,
        }}
      />
      {error ? (
        <FullPageError error={error.message} onRetry={() => refetch()} />
      ) : tag ? (
        <View>
          <UpdatingBookmarkList
            query={{
              tagId: tag.id,
              archived: showArchived ? undefined : false,
            }}
          />
        </View>
      ) : (
        <FullPageSpinner />
      )}
    </CustomSafeAreaView>
  );
}
