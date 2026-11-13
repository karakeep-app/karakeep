import { Stack } from "expo-router/stack";
import { tabScreenOptions } from "@/lib/tabScreenOptions";
import { Platform } from "react-native";
import BookmarkListHeader from "@/components/bookmarks/BookmarkListHeader";
import { useTranslation } from "@/lib/i18n/hooks";

export default function Layout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        ...tabScreenOptions,
        ...Platform.select({
          ios: {
            headerLeft: () => <BookmarkListHeader />,
          },
          android: {
            headerShown: false,
          },
        }),
      }}
    >
      <Stack.Screen name="index" options={{ title: t("tabs.home") }} />
    </Stack>
  );
}
