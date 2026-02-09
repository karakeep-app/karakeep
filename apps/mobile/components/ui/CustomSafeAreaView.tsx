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

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: edges.includes("top")
          ? headerHeight > 0
            ? headerHeight
            : undefined
          : undefined,
      }}
    >
      {children}
    </SafeAreaView>
  );
}
