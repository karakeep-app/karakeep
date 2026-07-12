import type { NativeStackNavigationOptions } from "expo-router";
import { Platform } from "react-native";

import { isIOS26 } from "./ios";

/**
 * Shared screen options for tab stack navigators.
 *
 * iOS: Large title with transparent/blur header (Liquid Glass on iOS 26).
 *
 * Android headers are rendered as inline React content (AndroidSearchBar /
 * InlineSearch) to avoid native header z-index issues. Native tabs account for
 * their own height on SDK 56, so tab screens must not add a manual bottom inset.
 */
export const tabScreenOptions: NativeStackNavigationOptions = {
  ...Platform.select({
    ios: {
      headerLargeTitle: true,
      headerTransparent: true,
      headerBlurEffect: isIOS26 ? undefined : ("systemMaterial" as const),
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
};
