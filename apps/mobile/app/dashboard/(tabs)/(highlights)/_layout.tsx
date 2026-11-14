import { Platform } from "react-native";
import { Stack } from "expo-router/stack";
import { horizontalSafeAreaLayout } from "@/components/navigation/screen-layout";
import { ProfileAvatarButton } from "@/components/settings/ProfileAvatarButton";
import { useTranslation } from "@/lib/i18n/hooks";
import { tabScreenOptions } from "@/lib/tabScreenOptions";

export default function Layout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenLayout={horizontalSafeAreaLayout()}
      screenOptions={{
        ...tabScreenOptions,
        ...Platform.select({
          ios: { headerRight: () => <ProfileAvatarButton /> },
        }),
      }}
    >
      <Stack.Screen name="index" options={{ title: t("tabs.highlights") }} />
    </Stack>
  );
}
