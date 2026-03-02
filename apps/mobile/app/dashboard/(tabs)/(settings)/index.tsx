import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
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
import { useMutation, useQuery } from "@tanstack/react-query";

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

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState("");

  const { mutate: deleteAccount, isPending: isDeleting } = useMutation(
    api.users.deleteAccount.mutationOptions({
      onSuccess: () => {
        setShowPasswordModal(false);
        setPassword("");
        Alert.alert(
          "Account Deleted",
          "Your account has been successfully deleted.",
          [{ text: "OK", onPress: logout }],
        );
      },
      onError: (e) => {
        if (e.data?.code === "UNAUTHORIZED") {
          Alert.alert("Error", "Invalid password. Please try again.");
        } else {
          Alert.alert("Error", "Failed to delete account. Please try again.");
        }
      },
    }),
  );

  const isLocalUser = data?.localUser ?? false;

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? All your bookmarks, lists, tags, highlights, and other data will be permanently deleted. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (isLocalUser) {
              setShowPasswordModal(true);
            } else {
              deleteAccount({});
            }
          },
        },
      ],
    );
  };

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
                    {
                      {
                        reader: "Reader",
                        browser: "Browser",
                        externalBrowser: "External Browser",
                      }[settings.defaultBookmarkView]
                    }
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
        <Divider orientation="horizontal" className="mx-6 my-1" />
        <Pressable
          className="flex flex-row items-center px-4 py-1"
          onPress={handleDeleteAccount}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text className="text-destructive">Delete Account</Text>
          )}
        </Pressable>
      </View>

      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowPasswordModal(false);
          setPassword("");
        }}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/50"
          onPress={() => {
            setShowPasswordModal(false);
            setPassword("");
          }}
        >
          <Pressable className="mx-8 w-full max-w-sm rounded-2xl bg-card p-6">
            <Text className="mb-2 text-lg font-bold">Enter Password</Text>
            <Text className="mb-4 text-sm text-muted-foreground">
              Please enter your password to confirm account deletion.
            </Text>
            <TextInput
              className="mb-4 rounded-lg border border-input bg-background px-3 py-2 text-foreground"
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoFocus
            />
            <View className="flex flex-row justify-end gap-3">
              <Pressable
                className="rounded-lg px-4 py-2"
                onPress={() => {
                  setShowPasswordModal(false);
                  setPassword("");
                }}
              >
                <Text className="text-muted-foreground">Cancel</Text>
              </Pressable>
              <Pressable
                className="rounded-lg bg-destructive px-4 py-2"
                onPress={() => deleteAccount({ password })}
                disabled={isDeleting || !password}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="font-medium text-destructive-foreground">
                    Delete
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
