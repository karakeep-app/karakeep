import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useColorScheme } from "@/lib/useColorScheme";
import { COLORS } from "@/theme/colors";

const SIZE = 56;
const TAB_BAR_GAP = 16;

export function FAB({ children }: { children: ReactNode }) {
  const { colorScheme } = useColorScheme();
  const primaryColor = COLORS[colorScheme].primary;

  return (
    <View style={[styles.container, { bottom: TAB_BAR_GAP, right: 16 }]}>
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
