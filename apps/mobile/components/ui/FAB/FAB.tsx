import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "@/lib/useColorScheme";
import { COLORS } from "@/theme/colors";

const SIZE = 56;
// Android M3 bottom navigation is ~80dp + 16dp gap
const TAB_BAR_CLEARANCE = 96;

export function FAB({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const primaryColor = COLORS[colorScheme].primary;

  return (
    <View
      style={[
        styles.container,
        { bottom: insets.bottom + TAB_BAR_CLEARANCE, right: 16 },
      ]}
    >
      <View style={[styles.button, { backgroundColor: primaryColor }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 10,
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    overflow: "hidden",
  },
});
