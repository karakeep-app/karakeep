import { Stack } from "expo-router/stack";
import { horizontalSafeAreaLayout } from "@/components/navigation/screen-layout";
import { useTranslation } from "@/lib/i18n/hooks";
import { tabScreenOptions } from "@/lib/tabScreenOptions";

export default function Layout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={tabScreenOptions}
      screenLayout={horizontalSafeAreaLayout()}
    >
      <Stack.Screen name="index" options={{ title: t("tabs.lists") }} />
    </Stack>
  );
}
