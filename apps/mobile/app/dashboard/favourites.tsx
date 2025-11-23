import { useLayoutEffect } from "react";
import { useNavigation } from "expo-router";
import BookmarkLayoutSelector from "@/components/bookmarks/BookmarkLayoutSelector";
import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";

export default function Favourites() {
  const navigator = useNavigation();
  useLayoutEffect(() => {
    navigator.setOptions({
      headerTitle: "⭐️ Favourites",
      headerLargeTitle: true,
      headerRight: () => <BookmarkLayoutSelector />,
    });
  }, [navigator]);
  return (
    <CustomSafeAreaView>
      <UpdatingBookmarkList
        query={{
          favourited: true,
        }}
      />
    </CustomSafeAreaView>
  );
}
