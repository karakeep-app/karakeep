import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Platform } from "react-native";

import { isIOS26 } from "./ios";

/**
 * Shared screen options for tab stack navigators.
 *
 * iOS: Large title with transparent/blur header (Liquid Glass on iOS 26).
 *
 * Android:
 * - `headerShown: false` — headers are rendered as inline React content
 *   (AndroidSearchBar / InlineSearch) to avoid native header z-index issues.
 * - `contentStyle.paddingBottom: 100` compensates for the native tab bar overlapping
 *   content. Should be removed when expo fixes this in SDK 55.
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
      headerShown: false,
      contentStyle: {
        // Manual padding to avoid the native tab bar until expo fixes this in SDK 55.
        paddingBottom: 100,
      },
    },
  }),
  headerShadowVisible: false,
};
