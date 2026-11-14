import type { AppStateStatus } from "react-native";
import { useEffect } from "react";
import { AppState, Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Stack } from "expo-router/stack";
import BookmarkListHeader from "@/components/bookmarks/BookmarkListHeader";
import { DashboardSidebar } from "@/components/navigation/DashboardSidebar";
import { horizontalSafeAreaLayout } from "@/components/navigation/screen-layout";
import { getFormSheetSurfaceOptions } from "@/lib/form-sheet-options";
import { useTranslation } from "@/lib/i18n/hooks";
import { isIOS26 } from "@/lib/ios";
import { useShowSidebar } from "@/lib/responsive";
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
  const formSheetSurfaceOptions = getFormSheetSurfaceOptions(colors.sheet);
  const showSidebar = useShowSidebar();
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
    <View style={{ flex: 1, flexDirection: "row" }}>
      {showSidebar && <DashboardSidebar />}
      {/* The navigator keeps its place in the tree when the sidebar appears or
          disappears (folding), so navigation state survives. Its own provider
          measures insets against this column rather than the window, so the
          rail isn't counted again when it's on the sidebar's side. */}
      <SafeAreaProvider style={{ flex: 1 }}>
        <Stack
          screenLayout={horizontalSafeAreaLayout(["(tabs)", "settings"])}
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
            // iOS 27 can leave the automatic back control empty after sign-in.
            headerBackButtonDisplayMode: "minimal",
          }}
        >
          <Stack.Screen
            name="(tabs)"
            options={{ headerShown: false, title: t("headers.home") }}
          />
          <Stack.Screen
            name="favourites"
            options={{
              headerTitle: t("lists_tab.favourites"),
              headerRight: () => <BookmarkListHeader />,
            }}
          />
          <Stack.Screen
            name="bookmarks/[slug]/index"
            options={{
              headerTitle: "",
              headerLargeTitle: false,
            }}
          />
          <Stack.Screen
            name="bookmarks/new"
            options={{
              ...formSheetSurfaceOptions,
              headerTitle: t("headers.new_bookmark"),
              headerTransparent: false,
              headerLargeTitle: false,
              presentation: Platform.select({
                ios: "formSheet" as const,
                default: "modal" as const,
              }),
              sheetGrabberVisible: true,
              sheetAllowedDetents: [0.55],
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
              headerTitle: t("headers.edit_details"),
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
            name="lists/[slug]/add"
            options={{
              ...formSheetSurfaceOptions,
              headerTitle: t("headers.add_bookmarks"),
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
            name="lists/[slug]/sharing"
            options={{
              ...formSheetSurfaceOptions,
              headerTitle: t("list_sharing.title"),
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
              ...formSheetSurfaceOptions,
              headerTitle: t("headers.parent_list"),
              headerLargeTitle: false,
              headerTransparent: false,
            }}
          />
          <Stack.Screen
            name="tags/new"
            options={{
              ...formSheetSurfaceOptions,
              sheetAllowedDetents: [0.45],
              headerTitle: t("headers.new_tag"),
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
              sheetAllowedDetents: [0.45],
              headerTitle: t("headers.edit_tag"),
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
              headerTitle: t("lists_tab.archive"),
              headerRight: () => <BookmarkListHeader />,
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              ...formSheetSurfaceOptions,
              headerShown: false,
              presentation: Platform.select({
                ios: "formSheet" as const,
                default: "modal" as const,
              }),
              sheetGrabberVisible: true,
            }}
          />
        </Stack>
      </SafeAreaProvider>
    </View>
  );
}
