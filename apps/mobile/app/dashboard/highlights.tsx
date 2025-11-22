import { useLayoutEffect } from "react";
import { useNavigation } from "expo-router";
import UpdatingHighlightList from "@/components/highlights/UpdatingHighlightList";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";

export default function Highlights() {
  const navigator = useNavigation();
  useLayoutEffect(() => {
    navigator.setOptions({
      headerTitle: "💡 Highlights",
      headerLargeTitle: true,
    });
  }, [navigator]);
  return (
    <CustomSafeAreaView>
      <UpdatingHighlightList />
    </CustomSafeAreaView>
  );
}
