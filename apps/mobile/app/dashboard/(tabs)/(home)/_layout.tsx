import { Stack } from "expo-router/stack";
import { tabScreenOptions } from "@/lib/tabScreenOptions";
import { Platform } from "react-native";
import BookmarkListHeader from "@/components/bookmarks/BookmarkListHeader";
import { ProfileAvatarButton } from "@/components/settings/ProfileAvatarButton";

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        ...tabScreenOptions,
        ...Platform.select({
          ios: {
            headerLeft: () => <BookmarkListHeader />,
            headerRight: () => <ProfileAvatarButton />,
          },
          android: {
            headerShown: false,
          },
        }),
      }}
    >
      <Stack.Screen name="index" options={{ title: "Home" }} />
    </Stack>
  );
}
