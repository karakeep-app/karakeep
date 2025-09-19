import { useLayoutEffect } from "react";
import { useNavigation } from "expo-router";
import UpdatingBookmarkList from "@/components/bookmarks/UpdatingBookmarkList";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";

export default function Archive() {
  const navigator = useNavigation();
  useLayoutEffect(() => {
    navigator.setOptions({
      headerTitle: "🗄️ Archive",
      headerLargeTitle: true,
    });
  }, [navigator]);
  return (
    <CustomSafeAreaView>
      <UpdatingBookmarkList query={{ archived: true }} />
    </CustomSafeAreaView>
  );
}
