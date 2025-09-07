import { useEffect } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import { useSharedValue } from "react-native-reanimated";
import { Link } from "expo-router";
import { Button } from "@/components/ui/Button";
import ChevronRight from "@/components/ui/ChevronRight";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Divider } from "@/components/ui/Divider";
import PageTitle from "@/components/ui/PageTitle";
import { Text } from "@/components/ui/Text";
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

  const { data, error, isLoading } = api.users.whoami.useQuery();

  if (error?.data?.code === "UNAUTHORIZED") {
    logout();
  }

  return (
    <CustomSafeAreaView>
      <PageTitle title="Settings" />
      <View className="flex h-full w-full items-center gap-3 px-4 py-2">
        <View className="flex w-full gap-3 rounded-lg bg-card px-4 py-2">
          <Text>{isSettingsLoading ? "Loading ..." : settings.address}</Text>
          <Divider orientation="horizontal" />
          <Text>{isLoading ? "Loading ..." : data?.email}</Text>
        </View>
        <Text className="w-full p-1 text-2xl font-bold text-foreground">
          App Settings
        </Text>
        <View className="flex w-full flex-row items-center justify-between gap-8 rounded-lg bg-card px-4 py-2">
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
        <View className="flex w-full flex-row items-center justify-between gap-8 rounded-lg bg-card px-4 py-2">
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
        <Text className="w-full p-1 text-2xl font-bold text-foreground">
          Upload Settings
        </Text>
        <View className="flex w-full flex-row items-center justify-between gap-8 rounded-lg bg-card px-4 py-2">
          <Text>Image Quality</Text>
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
        <Divider orientation="horizontal" />
        <Button
          androidRootClassName="w-full"
          onPress={logout}
          variant="destructive"
        >
          <Text>Log Out</Text>
        </Button>
      </View>
    </CustomSafeAreaView>
  );
}
