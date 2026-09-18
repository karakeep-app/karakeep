import type { AppStateStatus } from "react-native";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Stack } from "expo-router/stack";
import BookmarkListHeader from "@/components/bookmarks/BookmarkListHeader";
import { getFormSheetSurfaceOptions } from "@/lib/form-sheet-options";
import { useTranslation } from "@/lib/i18n/hooks";
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
  const { t } = useTranslation();
  const { colors } = useColorScheme();
  const backTitle = t("app.back");
  const settingsTitle = t("headers.settings");
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
        options={{ headerShown: false, title: t("headers.home") }}
      />
      <Stack.Screen
        name="favourites"
        options={{
          headerTitle: t("headers.favourites"),
          headerBackTitle: backTitle,
          headerRight: () => <BookmarkListHeader />,
        }}
      />
      <Stack.Screen
        name="bookmarks/[slug]/index"
        options={{
          headerTitle: "",
          headerBackTitle: backTitle,
          // iOS 27 can leave the automatic back control empty after sign-in.
          headerBackButtonDisplayMode: "minimal",
          headerLargeTitle: false,
        }}
      />
      <Stack.Screen
        name="bookmarks/new"
        options={{
          ...formSheetSurfaceOptions,
          headerTitle: t("headers.new_bookmark"),
          headerBackTitle: backTitle,
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
          headerTitle: t("headers.manage_tags"),
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
          headerTitle: t("headers.manage_lists"),
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
          headerTitle: t("headers.edit_bookmark"),
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
          headerTitle: t("headers.highlights"),
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
          headerTitle: t("headers.new_list"),
          headerBackTitle: backTitle,
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
          headerTitle: t("headers.edit_list"),
          headerBackTitle: backTitle,
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
          headerTitle: t("headers.parent_list"),
          headerBackTitle: backTitle,
          headerLargeTitle: false,
          headerTransparent: false,
        }}
      />
      <Stack.Screen
        name="tags/new"
        options={{
          ...formSheetSurfaceOptions,
          headerTitle: t("headers.new_tag"),
          headerBackTitle: backTitle,
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
        name="tags/[slug]/edit"
        options={{
          ...formSheetSurfaceOptions,
          headerTitle: t("headers.edit_tag"),
          headerBackTitle: backTitle,
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
          headerTitle: t("headers.archive"),
          headerBackTitle: backTitle,
          headerRight: () => <BookmarkListHeader />,
        }}
      />
      <Stack.Screen
        name="settings/index"
        options={{
          ...formSheetSurfaceOptions,
          ...settingsScreenOptions,
          headerTitle: settingsTitle,
          headerTransparent: false,
          presentation: Platform.select({
            ios: "formSheet" as const,
            default: "modal" as const,
          }),
          title: settingsTitle,
        }}
      />
      <Stack.Screen
        name="settings/reading"
        options={{
          ...settingsScreenOptions,
          headerBackTitle: settingsTitle,
          headerTitle: t("headers.reader_view"),
          title: t("headers.reader_view"),
        }}
      />
      <Stack.Screen
        name="settings/language"
        options={{
          ...settingsScreenOptions,
          headerBackTitle: settingsTitle,
          headerTitle: t("settings.language"),
          title: t("settings.language"),
        }}
      />
      <Stack.Screen
        name="settings/uploads"
        options={{
          ...settingsScreenOptions,
          headerBackTitle: settingsTitle,
          headerTitle: t("headers.uploads"),
          title: t("headers.uploads"),
        }}
      />
      <Stack.Screen
        name="settings/theme"
        options={{
          ...settingsScreenOptions,
          title: t("headers.theme"),
          headerTitle: t("headers.theme"),
          headerBackTitle: backTitle,
        }}
      />
      <Stack.Screen
        name="settings/bookmark-default-view"
        options={{
          ...settingsScreenOptions,
          title: t("headers.open_bookmarks_in"),
          headerTitle: t("headers.open_bookmarks_in"),
          headerBackTitle: backTitle,
        }}
      />
      <Stack.Screen
        name="settings/reader-settings"
        options={{
          ...settingsScreenOptions,
          title: t("headers.text_and_layout"),
          headerTitle: t("headers.text_and_layout"),
          headerBackTitle: backTitle,
        }}
      />
      <Stack.Screen
        name="settings/offline"
        options={{
          ...settingsScreenOptions,
          title: t("headers.downloads"),
          headerTitle: t("headers.downloads"),
          headerBackTitle: backTitle,
        }}
      />
      <Stack.Screen
        name="settings/usage"
        options={{
          ...settingsScreenOptions,
          title: t("headers.statistics"),
          headerTitle: t("headers.statistics"),
          headerBackTitle: backTitle,
        }}
      />
      <Stack.Screen
        name="settings/toolbar-settings"
        options={{
          ...settingsScreenOptions,
          title: t("headers.reader_toolbar"),
          headerTitle: t("headers.reader_toolbar"),
          headerBackTitle: backTitle,
        }}
      />
    </Stack>
  );
}
