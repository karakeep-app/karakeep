import { useEffect, useMemo } from "react";
import { ActivityIndicator, Switch, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import { useSharedValue } from "react-native-reanimated";
import Constants from "expo-constants";
import { Link } from "expo-router";
import { UserProfileHeader } from "@/components/settings/UserProfileHeader";
import { Button } from "@/components/ui/Button";
import ChevronRight from "@/components/ui/ChevronRight";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { List, ListItem, ListSectionHeader } from "@/components/ui/List";
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

  const listData = useMemo(() => {
    return [
      // Section 1: App Settings
      "",
      { title: "Theme", id: "theme" },
      { title: "Default Bookmark View", id: "default-view" },
      { title: "Reader Text Settings", id: "reader-settings" },
      { title: "Show note preview in bookmark", id: "show-notes" },
      // Section 2: Upload Settings
      "",
      { title: "Image Quality", id: "image-quality" },
    ];
  }, []);

  return (
    <CustomSafeAreaView>
      <List
        data={listData}
        variant="insets"
        sectionHeaderAsGap
        ListHeaderComponent={
          <UserProfileHeader
            image={data?.image}
            name={data?.name}
            email={data?.email}
          />
        }
        ListFooterComponent={
          <View className="w-full gap-3 px-4 py-4">
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
        }
        renderItem={(props) => {
          const { item } = props;

          if (typeof item === "string") {
            return <ListSectionHeader {...props} />;
          }

          // Theme setting
          if (item.id === "theme") {
            return (
              <Link asChild href="/dashboard/settings/theme">
                <ListItem
                  {...props}
                  textNumberOfLines={1}
                  textContentClassName="shrink"
                  rightView={
                    <View className="flex shrink-0 flex-row items-center gap-2">
                      <Text className="text-base text-muted-foreground">
                        {
                          { light: "Light", dark: "Dark", system: "System" }[
                            settings.theme
                          ]
                        }
                      </Text>
                      <ChevronRight />
                    </View>
                  }
                />
              </Link>
            );
          }

          // Default Bookmark View setting
          if (item.id === "default-view") {
            return (
              <Link asChild href="/dashboard/settings/bookmark-default-view">
                <ListItem
                  {...props}
                  textNumberOfLines={1}
                  textContentClassName="shrink"
                  rightView={
                    <View className="flex shrink-0 flex-row items-center gap-2">
                      {isSettingsLoading ? (
                        <ActivityIndicator size="small" />
                      ) : (
                        <Text className="text-base text-muted-foreground">
                          {settings.defaultBookmarkView === "reader"
                            ? "Reader"
                            : "Browser"}
                        </Text>
                      )}
                      <ChevronRight />
                    </View>
                  }
                />
              </Link>
            );
          }

          // Reader Settings
          if (item.id === "reader-settings") {
            return (
              <Link asChild href="/dashboard/settings/reader-settings">
                <ListItem
                  {...props}
                  textNumberOfLines={1}
                  textContentClassName="shrink"
                  rightView={
                    <View className="shrink-0">
                      <ChevronRight />
                    </View>
                  }
                />
              </Link>
            );
          }

          // Show notes toggle
          if (item.id === "show-notes") {
            return (
              <ListItem
                {...props}
                textNumberOfLines={1}
                textContentClassName="shrink"
                onPress={() =>
                  setSettings({
                    ...settings,
                    showNotes: !settings.showNotes,
                  })
                }
                rightView={
                  <View className="shrink-0">
                    <Switch
                      value={settings.showNotes}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          showNotes: value,
                        })
                      }
                    />
                  </View>
                }
              />
            );
          }

          // Image Quality slider
          if (item.id === "image-quality") {
            return (
              <ListItem
                {...props}
                textNumberOfLines={1}
                textContentClassName="shrink"
                rightView={
                  <View className="flex flex-1 shrink-0 flex-row items-center justify-center gap-2">
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
                }
              />
            );
          }

          return null;
        }}
      />
    </CustomSafeAreaView>
  );
}
