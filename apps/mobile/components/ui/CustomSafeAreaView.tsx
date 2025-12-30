import { Platform, SafeAreaView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";

export default function CustomSafeAreaView({
  children,
  edges = ["top", "bottom"],
}: {
  children: React.ReactNode;
  edges?: ("top" | "bottom")[];
}) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  return (
    <SafeAreaView
      style={{
        flex: 1,
        paddingTop:
          // Some ugly hacks to make the app look the same on both android and ios
          Platform.OS == "android" && edges.includes("top")
            ? headerHeight > 0
              ? headerHeight
              : insets.top
            : undefined,
        paddingBottom: edges.includes("bottom") ? insets.bottom : undefined,
      }}
    >
      {children}
    </SafeAreaView>
  );
}
