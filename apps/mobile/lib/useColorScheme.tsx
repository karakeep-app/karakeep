import * as React from "react";
import { Platform } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import useAppSettings from "@/lib/settings";
import { COLORS } from "@/theme/colors";
import { useColorScheme as useNativewindColorScheme } from "nativewind";

function useColorScheme() {
  const { settings, isLoading } = useAppSettings();
  const { colorScheme, setColorScheme: setNativewindColorScheme } =
    useNativewindColorScheme();

  // Sync user settings with native color scheme
  React.useEffect(() => {
    setNativewindColorScheme(settings.theme);
  }, [settings.theme, isLoading]);

  React.useEffect(() => {
    if (Platform.OS === "android") {
      setNavigationBar(colorScheme ?? "light").catch((error) => {
        console.error('useColorScheme.tsx", "setColorScheme', error);
      });
    }
  }, [colorScheme]);

  return {
    colorScheme: colorScheme ?? "light",
    isDarkColorScheme: colorScheme === "dark",
    colors: COLORS[colorScheme ?? "light"],
  };
}

/**
 * Set the Android navigation bar color based on the color scheme.
 */
function useInitialAndroidBarSync() {
  const { colorScheme } = useColorScheme();
  React.useEffect(() => {
    if (Platform.OS !== "android") return;
    setNavigationBar(colorScheme).catch((error) => {
      console.error('useColorScheme.tsx", "useInitialColorScheme', error);
    });
  }, []);
}

export { useColorScheme, useInitialAndroidBarSync };

function setNavigationBar(colorScheme: "light" | "dark") {
  return Promise.all([
    NavigationBar.setButtonStyleAsync(
      colorScheme === "dark" ? "light" : "dark",
    ),
    NavigationBar.setPositionAsync("absolute"),
    NavigationBar.setBackgroundColorAsync(
      colorScheme === "dark" ? "#00000030" : "#ffffff80",
    ),
  ]);
}
