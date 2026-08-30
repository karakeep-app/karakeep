import type { AppStateStatus } from "react-native";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Stack } from "expo-router/stack";
import BookmarkListHeader from "@/components/bookmarks/BookmarkListHeader";
import { getFormSheetSurfaceOptions } from "@/lib/form-sheet-options";
import { isIOS26 } from "@/lib/ios";
import { useIsLoggedIn } from "@/lib/session";
import { useColorScheme } from "@/lib/useColorScheme";
import { focusManager } from "@tanstack/react-query";

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== "web") {
    focusManager.setFocused(status === "active");
  }
}

export default function Dashboard() {
  const router = useRouter();
  const { colors } = useColorScheme();
  const formSheetSurfaceOptions = getFormSheetSurfaceOptions(colors.background);
  const settingsScreenOptions = {
    headerLargeTitle: false,
    sheetGrabberVisible: true,
  };

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
            headerBlurEffect: isIOS26 ? undefined : "systemMaterial",
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
          headerRight: () => <BookmarkListHeader />,
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
          ...formSheetSurfaceOptions,
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
          ...formSheetSurfaceOptions,
          headerTitle: "Manage Tags",
          headerTransparent: false,
          headerLargeTitle: false,
          presentation: Platform.select({
            ios: "formSheet" as const,
            default: "modal" as const,
          }),
          sheetGrabberVisible: true,
          sheetExpandsWhenScrolledToEdge: false,
        }}
      />
      <Stack.Screen
        name="bookmarks/[slug]/manage_lists"
        options={{
          ...formSheetSurfaceOptions,
          headerTitle: "Manage Lists",
          headerTransparent: false,
          headerLargeTitle: false,
          presentation: Platform.select({
            ios: "formSheet" as const,
            default: "modal" as const,
          }),
          sheetGrabberVisible: true,
          sheetExpandsWhenScrolledToEdge: false,
        }}
      />
      <Stack.Screen
        name="bookmarks/[slug]/info"
        options={{
          ...formSheetSurfaceOptions,
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
        name="bookmarks/[slug]/highlights"
        options={{
          ...formSheetSurfaceOptions,
          headerTitle: "Highlights",
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
          ...formSheetSurfaceOptions,
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
          ...formSheetSurfaceOptions,
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
        name="lists/select-parent"
        options={{
          headerTitle: "Parent List",
          headerBackTitle: "Back",
          headerLargeTitle: false,
          headerTransparent: false,
        }}
      />
      <Stack.Screen
        name="archive"
        options={{
          headerTitle: "🗄️ Archive",
          headerBackTitle: "Back",
          headerRight: () => <BookmarkListHeader />,
        }}
      />
      <Stack.Screen
        name="settings/index"
        options={{
          ...formSheetSurfaceOptions,
          ...settingsScreenOptions,
          headerTitle: "Settings",
          headerTransparent: false,
          presentation: Platform.select({
            ios: "formSheet" as const,
            default: "modal" as const,
          }),
          title: "Settings",
        }}
      />
      <Stack.Screen
        name="settings/reading"
        options={{
          ...settingsScreenOptions,
          headerBackTitle: "Settings",
          headerTitle: "Reader View",
          title: "Reader View",
        }}
      />
      <Stack.Screen
        name="settings/uploads"
        options={{
          ...settingsScreenOptions,
          headerBackTitle: "Settings",
          headerTitle: "Uploads",
          title: "Uploads",
        }}
      />
      <Stack.Screen
        name="settings/theme"
        options={{
          ...settingsScreenOptions,
          title: "Theme",
          headerTitle: "Theme",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="settings/bookmark-default-view"
        options={{
          ...settingsScreenOptions,
          title: "Open Bookmarks In",
          headerTitle: "Open Bookmarks In",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="settings/reader-settings"
        options={{
          ...settingsScreenOptions,
          title: "Text and Layout",
          headerTitle: "Text and Layout",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="settings/offline"
        options={{
          ...settingsScreenOptions,
          title: "Downloads",
          headerTitle: "Downloads",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="settings/usage"
        options={{
          ...settingsScreenOptions,
          title: "Statistics",
          headerTitle: "Statistics",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="settings/toolbar-settings"
        options={{
          ...settingsScreenOptions,
          title: "Reader Toolbar",
          headerTitle: "Reader Toolbar",
          headerBackTitle: "Back",
        }}
      />
    </Stack>
  );
}
