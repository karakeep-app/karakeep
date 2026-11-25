import { Stack } from "expo-router/stack";
import { router } from "expo-router";
import { horizontalSafeAreaLayout } from "@/components/navigation/screen-layout";
import { HeaderTextButton } from "@/components/ui/SheetHeader";
import { useTranslation } from "@/lib/i18n/hooks";
import { useColorScheme } from "@/lib/useColorScheme";

/**
 * Settings is one sheet with its own navigation stack, so sub-pages push and
 * pop instead of piling more sheets on top of each other.
 */
export default function SettingsLayout() {
  const { colors } = useColorScheme();
  const { t } = useTranslation();

  return (
    <Stack
      screenLayout={horizontalSafeAreaLayout()}
      screenOptions={({ navigation, route }) => ({
        contentStyle: { backgroundColor: colors.sheet },
        headerStyle: { backgroundColor: colors.sheet },
        headerShadowVisible: false,
        headerLargeTitle: false,
        headerTransparent: false,
        headerBackButtonDisplayMode: "minimal",
        // The sheet's first screen has nothing to pop back to, so it needs its
        // own way out. This also covers a sub-page opened from the reader.
        ...(navigation.getState().routes[0]?.key === route.key
          ? {
              headerRight: () => (
                <HeaderTextButton
                  label={t("bookmarks.done")}
                  emphasized
                  onPress={() => router.back()}
                />
              ),
            }
          : {}),
      })}
    >
      <Stack.Screen name="index" options={{ title: t("headers.settings") }} />
      <Stack.Screen
        name="language"
        options={{ title: t("settings.language") }}
      />
      <Stack.Screen
        name="reading"
        options={{ title: t("headers.reader_settings") }}
      />
      <Stack.Screen name="uploads" options={{ title: t("headers.uploads") }} />
      <Stack.Screen name="theme" options={{ title: t("headers.theme") }} />
      <Stack.Screen
        name="bookmark-default-view"
        options={{ title: t("headers.open_bookmarks_in") }}
      />
      <Stack.Screen
        name="reader-settings"
        options={{ title: t("headers.text_and_layout") }}
      />
      <Stack.Screen
        name="offline"
        options={{ title: t("headers.downloads") }}
      />
      <Stack.Screen
        name="offline-lists"
        options={{ title: t("settings.offline_lists_header") }}
      />
      <Stack.Screen
        name="offline-articles"
        options={{ title: t("settings.offline_downloaded_articles_label") }}
      />
      <Stack.Screen
        name="subscription"
        options={{ title: t("settings.subscription") }}
      />
      <Stack.Screen name="usage" options={{ title: t("headers.statistics") }} />
      <Stack.Screen
        name="toolbar-settings"
        options={{ title: t("headers.reader_toolbar") }}
      />
    </Stack>
  );
}
