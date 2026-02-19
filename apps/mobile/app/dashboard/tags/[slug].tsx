import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import FullPageError from "@/components/FullPageError";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { useQuery } from "@tanstack/react-query";

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
            }}
          />
        </View>
      ) : (
        <FullPageSpinner />
      )}
    </CustomSafeAreaView>
  );
}
