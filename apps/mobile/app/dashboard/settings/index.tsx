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
import { useCommonActions, useTranslation } from "@/lib/i18n/hooks";
import { getSystemLanguage } from "@/lib/i18n";
import { langNameMappings } from "@karakeep/shared/langs";
import {
  getOfflineLibraryScope,
  useOfflineLibrary,
} from "@/lib/offlineLibrary";
import { useSession } from "@/lib/session";
import {
  getBookmarkViewLabels,
  getThemeLabels,
  getTranslatedUploadQualityLabel,
} from "@/lib/settings-display";
import useAppSettings from "@/lib/settings";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

export default function Settings() {
  const router = useRouter();
  const api = useTRPC();
  const { logout } = useSession();
  const { settings, isLoading } = useAppSettings();
  const { t } = useTranslation();
  const actions = useCommonActions();
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
          t("settings.account_deleted_title"),
          t("settings.account_deleted_message"),
          [{ text: "OK", onPress: logout }],
        );
      },
      onError: (mutationError) => {
        if (mutationError.data?.code === "UNAUTHORIZED") {
          Alert.alert(
            t("app.error_title"),
            t("settings.delete_invalid_password"),
          );
        } else {
          Alert.alert(t("app.error_title"), t("settings.delete_failed"));
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
      t("settings.delete_account_title"),
      t("settings.delete_account_message"),
      [
        { text: actions.cancel, style: "cancel" },
        {
          text: t("bookmark_actions.delete"),
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

      <SettingsGroup header={t("settings.preferences")}>
        <SettingsNavigationRow
          label={t("settings.language")}
          onPress={() => router.push("/dashboard/settings/language")}
          value={
            settings.language === "system" || !settings.language
              ? t("settings.language_system", {
                  language:
                    langNameMappings[getSystemLanguage()] ??
                    getSystemLanguage(),
                })
              : (langNameMappings[settings.language] ?? settings.language)
          }
        />
        <SettingsSeparator />
        <SettingsNavigationRow
          label={t("settings.theme")}
          onPress={() => router.push("/dashboard/settings/theme")}
          value={getThemeLabels()[settings.theme]}
        />
        <SettingsSeparator />
        <SettingsNavigationRow
          isLoading={isLoading}
          label={t("settings.open_bookmarks_in")}
          onPress={() =>
            router.push("/dashboard/settings/bookmark-default-view")
          }
          value={getBookmarkViewLabels()[settings.defaultBookmarkView]}
        />
        <SettingsSeparator />
        <SettingsNavigationRow
          label={t("settings.reader_view")}
          onPress={() => router.push("/dashboard/settings/reading")}
        />
        <SettingsSeparator />
        <SettingsNavigationRow
          isLoading={isLoading}
          label={t("settings.uploads")}
          onPress={() => router.push("/dashboard/settings/uploads")}
          value={getTranslatedUploadQualityLabel(settings.imageQuality)}
        />
      </SettingsGroup>

      <SettingsGroup header={t("settings.data")}>
        <SettingsNavigationRow
          label={t("settings.downloads")}
          onPress={() => router.push("/dashboard/settings/offline")}
          value={String(offlineLibrary.length)}
        />
        <SettingsSeparator />
        <SettingsNavigationRow
          label={t("settings.statistics")}
          onPress={() => router.push("/dashboard/settings/usage")}
        />
      </SettingsGroup>

      <SettingsGroup header={t("settings.account")}>
        <SettingsActionRow label={t("auth.log_out")} onPress={logout} />
        <SettingsSeparator />
        <SettingsActionRow
          disabled={isDeleting}
          isLoading={isDeleting}
          label={t("settings.delete_account")}
          onPress={handleDeleteAccount}
        />
      </SettingsGroup>

      <SettingsGroup header={t("settings.about")}>
        <SettingsValueRow
          label={t("settings.server")}
          value={isLoading ? t("settings.loading") : settings.address}
        />
        <SettingsSeparator />
        <SettingsValueRow
          label={t("settings.app_version")}
          value={Constants.expoConfig?.version ?? t("settings.unavailable")}
        />
        <SettingsSeparator />
        <SettingsValueRow
          label={t("settings.server_version")}
          value={
            isServerVersionLoading
              ? t("settings.loading")
              : serverVersionError
                ? t("settings.unavailable")
                : (serverVersion ?? t("settings.unavailable"))
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
            <Text className="mb-2 text-lg font-bold">
              {t("settings.enter_password")}
            </Text>
            <Text className="mb-4 text-sm text-muted-foreground">
              {t("settings.enter_password_hint")}
            </Text>
            <TextInput
              autoFocus
              className="mb-4 rounded-lg border border-input bg-background px-3 py-2 text-foreground"
              onChangeText={setPassword}
              placeholder={t("auth.password")}
              secureTextEntry
              value={password}
            />
            <View className="flex-row justify-end gap-3">
              <Pressable
                className="rounded-lg px-4 py-2"
                onPress={closePasswordModal}
              >
                <Text className="text-muted-foreground">{actions.cancel}</Text>
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
                    {t("bookmark_actions.delete")}
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
