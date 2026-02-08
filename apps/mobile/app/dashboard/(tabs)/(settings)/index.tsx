import { useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  View,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
import { useSharedValue } from "react-native-reanimated";
import Constants from "expo-constants";
import { Link } from "expo-router";
import { UserProfileHeader } from "@/components/settings/UserProfileHeader";
import ChevronRight from "@/components/ui/ChevronRight";
import { Divider } from "@/components/ui/Divider";
import { Text } from "@/components/ui/Text";
import { useServerVersion } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import useAppSettings from "@/lib/settings";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="px-4 pb-1 pt-4 text-xs uppercase tracking-wide text-muted-foreground">
      {title}
    </Text>
  );
}

export default function Settings() {
  const { logout } = useSession();
  const {
    settings,
    setSettings,
    isLoading: isSettingsLoading,
  } = useAppSettings();
  const api = useTRPC();

  const imageQuality = useSharedValue(0);
  const imageQualityMin = useSharedValue(0);
  const imageQualityMax = useSharedValue(100);

  useEffect(() => {
    imageQuality.value = settings.imageQuality * 100;
  }, [settings]);

  const { data, error } = useQuery(api.users.whoami.queryOptions());
  const {
    data: serverVersion,
    isLoading: isServerVersionLoading,
    error: serverVersionError,
  } = useServerVersion();

  if (error?.data?.code === "UNAUTHORIZED") {
    logout();
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
    >
      <UserProfileHeader
        image={data?.image}
        name={data?.name}
        email={data?.email}
      />

      <SectionHeader title="Appearance" />
      <View
        className="w-full rounded-xl bg-card py-2"
        style={{ borderCurve: "continuous" }}
      >
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
      </View>

      <SectionHeader title="Reading" />
      <View
        className="w-full rounded-xl bg-card py-2"
        style={{ borderCurve: "continuous" }}
      >
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

      <SectionHeader title="Media" />
      <View
        className="w-full rounded-xl bg-card py-2"
        style={{ borderCurve: "continuous" }}
      >
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

      <SectionHeader title="Account" />
      <View
        className="w-full rounded-xl bg-card py-2"
        style={{ borderCurve: "continuous" }}
      >
        <Pressable
          className="flex flex-row items-center px-4 py-1"
          onPress={logout}
        >
          <Text className="text-destructive">Log Out</Text>
        </Pressable>
      </View>

      <SectionHeader title="About" />
      <View
        className="w-full rounded-xl bg-card py-2"
        style={{ borderCurve: "continuous" }}
      >
        <View className="flex flex-row items-center justify-between px-4 py-1">
          <Text className="text-muted-foreground">Server</Text>
          <Text className="text-sm text-muted-foreground">
            {isSettingsLoading ? "Loading..." : settings.address}
          </Text>
        </View>
        <Divider orientation="horizontal" className="mx-6 my-1" />
        <View className="flex flex-row items-center justify-between px-4 py-1">
          <Text className="text-muted-foreground">App Version</Text>
          <Text className="text-sm text-muted-foreground">
            {Constants.expoConfig?.version ?? "unknown"}
          </Text>
        </View>
        <Divider orientation="horizontal" className="mx-6 my-1" />
        <View className="flex flex-row items-center justify-between px-4 py-1">
          <Text className="text-muted-foreground">Server Version</Text>
          <Text className="text-sm text-muted-foreground">
            {isServerVersionLoading
              ? "Loading..."
              : serverVersionError
                ? "unavailable"
                : (serverVersion ?? "unknown")}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
