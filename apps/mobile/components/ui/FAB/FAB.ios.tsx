import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { isIOS26, isIPad } from "@/lib/ios";

const shouldUseGlass = isIOS26 && isGlassEffectAPIAvailable();
const SIZE = 62;

export function FAB({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          bottom: insets.bottom + (isIPad ? 0 : isIOS26 ? 57 : 60),
          right: isIOS26 ? 21 : 16,
        },
      ]}
    >
      {shouldUseGlass ? (
        <GlassView glassEffectStyle="regular" style={styles.button}>
          {children}
        </GlassView>
      ) : (
        <BlurView tint="systemMaterial" intensity={80} style={styles.button}>
          {children}
        </BlurView>
      )}
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
    borderRadius: SIZE / 2,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
