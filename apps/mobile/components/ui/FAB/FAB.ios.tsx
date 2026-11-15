import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { isIOS26, isIPad } from "@/lib/ios";
import { useColorScheme } from "@/lib/useColorScheme";

const shouldUseGlass = isIOS26 && isGlassEffectAPIAvailable();
const SIZE = 56;
const TAB_BAR_GAP = 12;

export function FAB({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useColorScheme();

  return (
    <View
      style={[
        styles.container,
        {
          bottom: insets.bottom + (isIPad ? 0 : TAB_BAR_GAP),
          right: isIOS26 ? 21 : 16,
        },
      ]}
    >
      {shouldUseGlass ? (
        <GlassView
          glassEffectStyle="regular"
          tintColor={colors.primary}
          isInteractive
          style={styles.button}
        >
          {children}
        </GlassView>
      ) : (
        <View style={[styles.button, { backgroundColor: colors.primary }]}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
