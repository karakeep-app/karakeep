import type { AppStateStatus } from "react-native";
import { useEffect, useLayoutEffect } from "react";
import { AppState, Platform } from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { Stack } from "expo-router/stack";
import { StyledStack } from "@/components/navigation/stack";
import { useIsLoggedIn } from "@/lib/session";
import { focusManager } from "@tanstack/react-query";

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== "web") {
    focusManager.setFocused(status === "active");
  }
}

export default function Dashboard() {
  const router = useRouter();

  const navigation = useNavigation();
  // Hide the header on the parent screen
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

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
    <StyledStack
      contentClassName="bg-gray-100 dark:bg-background"
      headerClassName="dark:text-white"
      screenOptions={{
        headerTransparent: true,
      }}
    >
      <Stack.Screen
        name="(tabs)"
        options={{ headerShown: false, title: "Home" }}
      />
      <Stack.Screen
        name="favourites"
        options={{
          headerTitle: "",
          headerBackTitle: "Back",
          headerTransparent: true,
        }}
      />
      <Stack.Screen
        name="bookmarks/[slug]/index"
        options={{
          headerTitle: "",
          headerBackTitle: "Back",
          headerTransparent: true,
        }}
      />
      <Stack.Screen
        name="bookmarks/new"
        options={{
          headerTitle: "New Bookmark",
          headerBackTitle: "Back",
          headerTransparent: true,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="bookmarks/[slug]/manage_tags"
        options={{
          headerTitle: "Manage Tags",
          headerBackTitle: "Back",
          headerTransparent: true,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="bookmarks/[slug]/manage_lists"
        options={{
          headerTitle: "Manage Lists",
          headerBackTitle: "Back",
          headerTransparent: true,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="bookmarks/[slug]/info"
        options={{
          headerBackTitle: "Back",
          headerTransparent: true,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="lists/new"
        options={{
          headerTitle: "New List",
          headerBackTitle: "Back",
          headerTransparent: true,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="lists/[slug]/edit"
        options={{
          headerTitle: "Edit List",
          headerBackTitle: "Back",
          headerTransparent: true,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="archive"
        options={{
          headerTitle: "",
          headerBackTitle: "Back",
          headerTransparent: true,
        }}
      />
      <Stack.Screen
        name="search"
        options={{
          headerTitle: "",
          headerBackTitle: "",
          headerTransparent: true,
          headerShown: false,
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
    </StyledStack>
  );
}
