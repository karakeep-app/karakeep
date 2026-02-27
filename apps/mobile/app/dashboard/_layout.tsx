import type { AppStateStatus } from "react-native";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Stack } from "expo-router/stack";
import { useIsLoggedIn } from "@/lib/session";
import { focusManager } from "@tanstack/react-query";

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== "web") {
    focusManager.setFocused(status === "active");
  }
}

export default function Dashboard() {
  const router = useRouter();

  const isLoggedIn = useIsLoggedIn();
  useEffect(() => {
    if (isLoggedIn !== undefined && !isLoggedIn) {
      return router.replace("signin");
    }
  }, [isLoggedIn]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", onAppStateChange);

    return () => subscription.remove();
  }, []);

  return (
    <Stack
      screenOptions={{
        ...Platform.select({
          ios: {
            headerTransparent: true,
            headerBlurEffect: "systemMaterial",
            headerLargeTitle: true,
            headerLargeTitleShadowVisible: false,
            headerLargeStyle: { backgroundColor: "transparent" },
          },
          android: {
            headerStyle: {
              backgroundColor: "transparent",
            },
          },
        }),
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="(tabs)"
        options={{ headerShown: false, title: "Home" }}
      />
      <Stack.Screen
        name="favourites"
        options={{
          headerTitle: "⭐️ Favourites",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="bookmarks/[slug]/index"
        options={{
          headerTitle: "",
          headerBackTitle: "Back",
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen
        name="bookmarks/new"
        options={{
          headerTitle: "New Bookmark",
          headerBackTitle: "Back",
          headerTransparent: false,
          headerLargeTitle: false,
          presentation: Platform.select({
            ios: "formSheet" as const,
            default: "modal" as const,
          }),
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.35, 0.7],
        }}
      />
      <Stack.Screen
        name="bookmarks/[slug]/manage_tags"
        options={{
          headerTitle: "Manage Tags",
          headerTransparent: false,
          headerLargeTitle: false,
          presentation: Platform.select({
            ios: "formSheet" as const,
            default: "modal" as const,
          }),
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="bookmarks/[slug]/manage_lists"
        options={{
          headerTitle: "Manage Lists",
          headerTransparent: false,
          headerLargeTitle: false,
          presentation: Platform.select({
            ios: "formSheet" as const,
            default: "modal" as const,
          }),
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="bookmarks/[slug]/info"
        options={{
          headerTitle: "Edit Bookmark",
          headerTransparent: false,
          headerLargeTitle: false,
          presentation: Platform.select({
            ios: "formSheet" as const,
            default: "modal" as const,
          }),
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="lists/new"
        options={{
          headerTitle: "New List",
          headerBackTitle: "Back",
          headerLargeTitle: false,
          headerTransparent: false,
          presentation: Platform.select({
            ios: "formSheet" as const,
            default: "modal" as const,
          }),
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="lists/[slug]/edit"
        options={{
          headerTitle: "Edit List",
          headerBackTitle: "Back",
          headerLargeTitle: false,
          headerTransparent: false,
          presentation: Platform.select({
            ios: "formSheet" as const,
            default: "modal" as const,
          }),
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="archive"
        options={{
          headerTitle: "🗄️ Archive",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="search"
        options={{
          headerTitle: "",
          headerBackTitle: "",
          headerShown: true,
          headerTransparent: false,
          headerLargeTitle: false,
          animation: "fade_from_bottom",
          animationDuration: 100,
        }}
      />
      <Stack.Screen
        name="settings/theme"
        options={{
          title: "Theme",
          headerTitle: "Theme",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="settings/bookmark-default-view"
        options={{
          title: "Bookmark View Mode",
          headerTitle: "Bookmark View Mode",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="settings/reader-settings"
        options={{
          title: "Reader Settings",
          headerTitle: "Reader Settings",
          headerBackTitle: "Back",
        }}
      />
    </Stack>
  );
}
