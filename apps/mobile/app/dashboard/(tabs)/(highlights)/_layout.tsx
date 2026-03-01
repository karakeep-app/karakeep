import { Platform } from "react-native";
import { Stack } from "expo-router/stack";
import { isIOS26 } from "@/lib/ios";

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        ...Platform.select({
          ios: {
            headerLargeTitle: true,
            headerTransparent: true,
            headerBlurEffect: isIOS26 ? undefined : "systemMaterial",
            headerLargeTitleShadowVisible: false,
            headerLargeStyle: { backgroundColor: "transparent" },
          },
          android: {
            headerShown: false,
            contentStyle: {
              // Manual padding to avoid the native tabbar until expo fixes this in sdk 55.
              paddingBottom: 100,
            },
          },
        }),
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Highlights" }} />
    </Stack>
  );
}
