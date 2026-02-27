import { Platform } from "react-native";
import { Stack } from "expo-router/stack";

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        ...Platform.select({
          ios: {
            headerLargeTitle: true,
            headerTransparent: true,
            headerBlurEffect: "systemMaterial",
            headerLargeTitleShadowVisible: false,
            headerLargeStyle: { backgroundColor: "transparent" },
          },
          android: {
            headerStyle: {
              backgroundColor: "transparent",
            },
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
