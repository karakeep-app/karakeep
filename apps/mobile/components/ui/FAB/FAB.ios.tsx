import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { isIOS26 } from "@/lib/ios";
import { useColorScheme } from "@/lib/useColorScheme";

const shouldUseGlass = isIOS26 && isGlassEffectAPIAvailable();
const SIZE = 62;

export function FAB({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();

  return (
    <View
      style={[
        styles.container,
        {
          bottom: insets.bottom + (isIOS26 ? 57 : 60),
          right: isIOS26 ? 21 : 16,
        },
      ]}
    >
      {shouldUseGlass ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme={colorScheme}
          style={styles.button}
        >
          {children}
        </GlassView>
      ) : (
        <BlurView
          tint={
            colorScheme === "dark"
              ? "systemMaterialDark"
              : "systemMaterialLight"
          }
          intensity={80}
          style={styles.button}
        >
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
