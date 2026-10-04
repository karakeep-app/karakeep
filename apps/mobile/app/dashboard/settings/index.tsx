import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  TextInput,
  View,
} from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsNavigationRow,
  SettingsScreen,
  SettingsSeparator,
  SettingsValueRow,
} from "@/components/settings/settings-list";
import { UserProfileHeader } from "@/components/settings/UserProfileHeader";
import { Text } from "@/components/ui/Text";
import { useServerVersion } from "@/lib/hooks";
import {
  getOfflineLibraryScope,
  useOfflineLibrary,
} from "@/lib/offlineLibrary";
import { useSession } from "@/lib/session";
import {
  BOOKMARK_VIEW_LABELS,
  getUploadQualityLabel,
  THEME_LABELS,
} from "@/lib/settings-display";
import useAppSettings from "@/lib/settings";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

export default function Settings() {
  const router = useRouter();
  const api = useTRPC();
  const { logout } = useSession();
  const { settings, isLoading } = useAppSettings();
  const offlineLibrary = useOfflineLibrary(getOfflineLibraryScope(settings));
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
      onError: (mutationError) => {
        if (mutationError.data?.code === "UNAUTHORIZED") {
          Alert.alert("Error", "Invalid password. Please try again.");
        } else {
          Alert.alert("Error", "Failed to delete account. Please try again.");
        }
      },
    }),
  );

  useEffect(() => {
    if (error?.data?.code === "UNAUTHORIZED") {
      logout();
    }
  }, [error?.data?.code, logout]);

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPassword("");
  };

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
            if (data?.localUser ?? false) {
              setShowPasswordModal(true);
            } else {
              deleteAccount({});
            }
          },
        },
      ],
    );
  };

  return (
    <SettingsScreen>
      <UserProfileHeader
        image={data?.image}
        name={data?.name}
        email={data?.email}
      />

      <SettingsGroup header="Preferences">
        <SettingsNavigationRow
          label="Theme"
          onPress={() => router.push("/dashboard/settings/theme")}
          value={THEME_LABELS[settings.theme]}
        />
        <SettingsSeparator />
        <SettingsNavigationRow
          isLoading={isLoading}
          label="Open bookmarks in"
          onPress={() =>
            router.push("/dashboard/settings/bookmark-default-view")
          }
          value={BOOKMARK_VIEW_LABELS[settings.defaultBookmarkView]}
        />
        <SettingsSeparator />
        <SettingsNavigationRow
          label="Reader View"
          onPress={() => router.push("/dashboard/settings/reading")}
        />
        <SettingsSeparator />
        <SettingsNavigationRow
          isLoading={isLoading}
          label="Uploads"
          onPress={() => router.push("/dashboard/settings/uploads")}
          value={getUploadQualityLabel(settings.imageQuality)}
        />
      </SettingsGroup>

      <SettingsGroup header="Data">
        <SettingsNavigationRow
          label="Downloads"
          onPress={() => router.push("/dashboard/settings/offline")}
          value={String(offlineLibrary.length)}
        />
        <SettingsSeparator />
        <SettingsNavigationRow
          label="Statistics"
          onPress={() => router.push("/dashboard/settings/usage")}
        />
      </SettingsGroup>

      <SettingsGroup header="Account">
        <SettingsActionRow label="Log Out" onPress={logout} />
        <SettingsSeparator />
        <SettingsActionRow
          disabled={isDeleting}
          isLoading={isDeleting}
          label="Delete Account"
          onPress={handleDeleteAccount}
        />
      </SettingsGroup>

      <SettingsGroup header="About">
        <SettingsValueRow
          label="Server"
          value={isLoading ? "Loading..." : settings.address}
        />
        <SettingsSeparator />
        <SettingsValueRow
          label="App Version"
          value={Constants.expoConfig?.version ?? "Unknown"}
        />
        <SettingsSeparator />
        <SettingsValueRow
          label="Server Version"
          value={
            isServerVersionLoading
              ? "Loading..."
              : serverVersionError
                ? "Unavailable"
                : (serverVersion ?? "Unknown")
          }
        />
      </SettingsGroup>

      <Modal
        animationType="fade"
        onRequestClose={closePasswordModal}
        transparent
        visible={showPasswordModal}
      >
        <Pressable
          accessibilityViewIsModal
          className="flex-1 items-center justify-center bg-black/50 px-8"
          onPress={closePasswordModal}
        >
          <Pressable
            className="w-full max-w-sm rounded-2xl bg-card p-6"
            onPress={(event) => event.stopPropagation()}
            style={{ borderCurve: "continuous" }}
          >
            <Text className="mb-2 text-lg font-bold">Enter Password</Text>
            <Text className="mb-4 text-sm text-muted-foreground">
              Enter your password to confirm account deletion.
            </Text>
            <TextInput
              autoFocus
              className="mb-4 rounded-lg border border-input bg-background px-3 py-2 text-foreground"
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              value={password}
            />
            <View className="flex-row justify-end gap-3">
              <Pressable
                className="rounded-lg px-4 py-2"
                onPress={closePasswordModal}
              >
                <Text className="text-muted-foreground">Cancel</Text>
              </Pressable>
              <Pressable
                className="rounded-lg bg-destructive px-4 py-2"
                disabled={isDeleting || password.length === 0}
                onPress={() => deleteAccount({ password })}
              >
                {isDeleting ? (
                  <ActivityIndicator color="white" size="small" />
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
    </SettingsScreen>
  );
}
