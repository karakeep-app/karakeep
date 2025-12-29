import { useEffect } from "react";
import { ActivityIndicator, Pressable, Switch, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import { useSharedValue } from "react-native-reanimated";
import Constants from "expo-constants";
import { Link } from "expo-router";
import { UserProfileHeader } from "@/components/settings/UserProfileHeader";
import { Button } from "@/components/ui/Button";
import ChevronRight from "@/components/ui/ChevronRight";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Divider } from "@/components/ui/Divider";
import { Text } from "@/components/ui/Text";
import { useServerVersion } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import useAppSettings from "@/lib/settings";
import { api } from "@/lib/trpc";

export default function Dashboard() {
  const { logout } = useSession();
  const {
    settings,
    setSettings,
    isLoading: isSettingsLoading,
  } = useAppSettings();

  const imageQuality = useSharedValue(0);
  const imageQualityMin = useSharedValue(0);
  const imageQualityMax = useSharedValue(100);

  useEffect(() => {
    imageQuality.value = settings.imageQuality * 100;
  }, [settings]);

  const { data, error } = api.users.whoami.useQuery();
  const {
    data: serverVersion,
    isLoading: isServerVersionLoading,
    error: serverVersionError,
  } = useServerVersion();

  if (error?.data?.code === "UNAUTHORIZED") {
    logout();
  }

  return (
    <CustomSafeAreaView>
      <UserProfileHeader
        image={data?.image}
        name={data?.name}
        email={data?.email}
      />
      <View className="flex h-full w-full items-center gap-3 px-4 py-2">
        <View className="w-full rounded-xl bg-card py-2">
          <View className="flex flex-row items-center justify-between gap-8 px-4 py-1">
            <Link asChild href="/dashboard/settings/theme" className="flex-1">
              <Pressable className="flex flex-row justify-between">
                <Text>Theme</Text>
                <View className="flex flex-row items-center gap-2">
                  <Text className="text-muted-foreground">
                    {
                      { light: "Light", dark: "Dark", system: "System" }[
                        settings.theme
                      ]
                    }
                  </Text>
                  <ChevronRight />
                </View>
              </Pressable>
            </Link>
          </View>
          <Divider orientation="horizontal" className="mx-6 my-1" />
          <View className="flex flex-row items-center justify-between gap-8 px-4 py-1">
            <Link
              asChild
              href="/dashboard/settings/bookmark-default-view"
              className="flex-1"
            >
              <Pressable className="flex flex-row justify-between">
                <Text>Default Bookmark View</Text>
                <View className="flex flex-row items-center gap-2">
                  {isSettingsLoading ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Text className="text-muted-foreground">
                      {settings.defaultBookmarkView === "reader"
                        ? "Reader"
                        : "Browser"}
                    </Text>
                  )}
                  <ChevronRight />
                </View>
              </Pressable>
            </Link>
          </View>
          <Divider orientation="horizontal" className="mx-6 my-1" />
          <View className="flex flex-row items-center justify-between gap-8 px-4 py-1">
            <Link
              asChild
              href="/dashboard/settings/reader-settings"
              className="flex-1"
            >
              <Pressable className="flex flex-row justify-between">
                <Text>Reader Text Settings</Text>
                <ChevronRight />
              </Pressable>
            </Link>
          </View>
          <Divider orientation="horizontal" className="mx-6 my-1" />
          <View className="flex flex-row items-center justify-between gap-8 px-4 py-1">
            <Text className="flex-1" numberOfLines={1}>
              Show notes in bookmark card
            </Text>
            <Switch
              className="shrink-0"
              value={settings.showNotes}
              onValueChange={(value) =>
                setSettings({
                  ...settings,
                  showNotes: value,
                })
              }
            />
          </View>
        </View>

        <View className="w-full rounded-xl bg-card py-2">
          <View className="flex w-full flex-row items-center justify-between gap-8 px-4 py-1">
            <Text>Upload Image Quality</Text>
            <View className="flex flex-1 flex-row items-center justify-center gap-2">
              <Text className="text-foreground">
                {Math.round(settings.imageQuality * 100)}%
              </Text>
              <Slider
                onSlidingComplete={(value) =>
                  setSettings({
                    ...settings,
                    imageQuality: Math.round(value) / 100,
                  })
                }
                progress={imageQuality}
                minimumValue={imageQualityMin}
                maximumValue={imageQualityMax}
              />
            </View>
          </View>
        </View>
        <Button
          androidRootClassName="w-full"
          onPress={logout}
          variant="destructive"
        >
          <Text>Log Out</Text>
        </Button>
        <View className="mt-4 w-full gap-1">
          <Text className="text-center text-sm text-muted-foreground">
            {isSettingsLoading ? "Loading..." : settings.address}
          </Text>
          <Text className="text-center text-sm text-muted-foreground">
            App Version: {Constants.expoConfig?.version ?? "unknown"}
          </Text>
          <Text className="text-center text-sm text-muted-foreground">
            Server Version:{" "}
            {isServerVersionLoading
              ? "Loading..."
              : serverVersionError
                ? "unavailable"
                : (serverVersion ?? "unknown")}
          </Text>
        </View>
      </View>
    </CustomSafeAreaView>
  );
}
