import { Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "@/lib/useColorScheme";
import { useHeaderHeight } from "@react-navigation/elements";

export default function CustomSafeAreaView({
  children,
  edges = ["top", "bottom"],
}: {
  children: React.ReactNode;
  edges?: ("top" | "bottom")[];
}) {
  const headerHeight = useHeaderHeight();
  const { colors } = useColorScheme();

  // Only add paddingTop on iOS where headers are transparent and don't take up layout space.
  // On Android, headers are non-transparent and already push content down.
  const paddingTop =
    Platform.OS === "ios" && edges.includes("top") && headerHeight > 0
      ? headerHeight
      : undefined;

  return (
    <SafeAreaView
      edges={edges}
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop,
      }}
    >
      {children}
    </SafeAreaView>
  );
}
