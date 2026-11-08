import { Alert, View } from "react-native";
import { useRouter } from "expo-router";
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsMenuRow,
  SettingsNavigationRow,
  SettingsScreen,
  SettingsSeparator,
  SettingsToggleRow,
} from "@/components/settings/settings-list";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { getDateFnsLocale, getIntlLocale } from "@/lib/i18n";
import { useCommonActions, useTranslation } from "@/lib/i18n/hooks";
import type { MobileTFunction } from "@/lib/i18n/hooks";
import { clearPersistedCache, usePersistedCacheSize } from "@/lib/offlineCache";
import {
  BUDGET_MB_OPTIONS,
  isAutoDownloadEnabled,
  RECENT_LIMIT_OPTIONS,
  updateOfflineDownloadPrefs,
  useOfflineDownloadPrefs,
} from "@/lib/offlineDownloadPrefs";
import {
  getOfflineLibraryScope,
  removeAllOfflineArticles,
  useOfflineLibrary,
} from "@/lib/offlineLibrary";
import type { OfflineSyncStatus } from "@/lib/offlineSync";
import {
  cancelOfflineDownloads,
  refreshOfflineDownloads,
  useOfflineSyncStatus,
} from "@/lib/offlineSync";
import useAppSettings from "@/lib/settings";
import { formatStorageSize, megabytesToBytes } from "@/lib/storageSize";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

function statusTitle(t: MobileTFunction, status: OfflineSyncStatus) {
  switch (status.phase) {
    case "checking":
      return t("settings.offline_status_checking");
    case "downloading":
      return t("settings.offline_status_downloading");
    case "wifi":
      return t("settings.offline_status_wifi");
    case "offline":
      return t("settings.offline_status_offline");
    case "paused":
      return t("settings.offline_status_paused");
    case "error":
      return t("settings.offline_status_error");
    case "ready":
      if (status.budgetReached) {
        return t("settings.offline_status_budget");
      }
      return status.failed > 0
        ? t("settings.offline_status_missing")
        : t("settings.offline_status_uptodate");
    case "idle":
    case "disabled":
      return t("settings.offline_status_notchecked");
  }
}

function statusNotes(t: MobileTFunction, status: OfflineSyncStatus) {
  const notes: string[] = [];
  if (status.phase === "error") {
    notes.push(t("settings.offline_note_error"));
  }
  if (status.failed > 0) {
    notes.push(t("settings.offline_note_failed", { count: status.failed }));
  }
  if (status.budgetReached) {
    notes.push(t("settings.offline_note_budget"));
  }
  return notes;
}

function DownloadProgress({ status }: { status: OfflineSyncStatus }) {
  const fraction = status.total > 0 ? status.ready / status.total : 0;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: status.total, now: status.ready }}
      className="h-1 overflow-hidden rounded-full bg-muted/30"
    >
      <View
        className="h-full rounded-full bg-primary"
        style={{ width: `${Math.round(fraction * 100)}%` }}
      />
    </View>
  );
}

function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <View className="flex-row items-center justify-between px-4">
      <Text
        variant="footnote"
        color="tertiary"
        className="uppercase tracking-wide"
      >
        {title}
      </Text>
      {detail ? (
        <Text variant="footnote" color="tertiary" className="tabular-nums">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

export default function OfflineContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const actions = useCommonActions();
  const { settings } = useAppSettings();
  const scope = getOfflineLibraryScope(settings);
  const prefs = useOfflineDownloadPrefs(scope);
  const status = useOfflineSyncStatus(scope);
  const offlineLibrary = useOfflineLibrary(scope);
  const recentCacheSize = usePersistedCacheSize();

  const usedBytes = offlineLibrary.reduce(
    (sum, item) => sum + (item.byteSize ?? 0),
    0,
  );
  const autoEnabled = isAutoDownloadEnabled(prefs);
  const isBusy = status.phase === "checking" || status.phase === "downloading";

  const recentLimitMenu = RECENT_LIMIT_OPTIONS.map((value) => ({
    value,
    label: t("settings.offline_recent_limit", { count: value }),
  }));

  const budgetMenu = BUDGET_MB_OPTIONS.map((value) => ({
    value,
    label: formatStorageSize(megabytesToBytes(value), getIntlLocale()),
  }));

  const confirmRemoveAll = () => {
    Alert.alert(
      t("settings.offline_remove_all_title"),
      t("settings.offline_remove_all_message"),
      [
        { text: actions.cancel, style: "cancel" },
        {
          text: t("settings.offline_remove_all_confirm"),
          style: "destructive",
          onPress: () => {
            cancelOfflineDownloads();
            updateOfflineDownloadPrefs(scope, (current) => ({
              ...current,
              recentEnabled: false,
              listIds: [],
              excludedIds: [],
            }));
            removeAllOfflineArticles(scope);
          },
        },
      ],
    );
  };

  const confirmClearRecentCache = () => {
    Alert.alert(
      t("settings.offline_clear_title"),
      t("settings.offline_clear_message"),
      [
        { text: actions.cancel, style: "cancel" },
        {
          text: t("settings.offline_clear_confirm"),
          style: "destructive",
          onPress: () => {
            queryClient.clear();
            clearPersistedCache();
            toast({ message: t("settings.offline_cleared") });
          },
        },
      ],
    );
  };

  const notes = statusNotes(t, status);

  return (
    <SettingsScreen>
      <Text className="px-1 text-sm text-muted-foreground">
        {t("settings.offline_intro")}
      </Text>

      <SettingsGroup
        header={t("settings.offline_automatic_downloads")}
        footer={t("settings.offline_automatic_downloads_footer")}
      >
        <SettingsToggleRow
          label={t("settings.offline_recent_articles")}
          onValueChange={(recentEnabled) =>
            updateOfflineDownloadPrefs(scope, (current) => ({
              ...current,
              recentEnabled,
            }))
          }
          value={prefs.recentEnabled}
        />
        {prefs.recentEnabled ? (
          <>
            <SettingsSeparator />
            <SettingsMenuRow
              label={t("settings.offline_keep")}
              onSelect={(recentLimit) =>
                updateOfflineDownloadPrefs(scope, (current) => ({
                  ...current,
                  recentLimit,
                }))
              }
              options={recentLimitMenu}
              value={prefs.recentLimit}
            />
          </>
        ) : null}
        <SettingsSeparator />
        <SettingsNavigationRow
          label={t("tabs.lists")}
          onPress={() => router.push("/dashboard/settings/offline-lists")}
          value={
            prefs.listIds.length > 0
              ? t("settings.offline_lists_selected", {
                  count: prefs.listIds.length,
                })
              : t("settings.offline_lists_none")
          }
        />
      </SettingsGroup>

      <SettingsGroup
        header={t("settings.offline_storage_network")}
        footer={t("settings.offline_storage_network_footer")}
      >
        <SettingsMenuRow
          label={t("settings.offline_storage_limit")}
          onSelect={(budgetMb) =>
            updateOfflineDownloadPrefs(scope, (current) => ({
              ...current,
              budgetMb,
            }))
          }
          options={budgetMenu}
          value={prefs.budgetMb}
        />
        <SettingsSeparator />
        <SettingsToggleRow
          label={t("settings.offline_wifi_only")}
          onValueChange={(wifiOnly) =>
            updateOfflineDownloadPrefs(scope, (current) => ({
              ...current,
              wifiOnly,
            }))
          }
          value={prefs.wifiOnly}
        />
      </SettingsGroup>

      {autoEnabled ? (
        <SettingsGroup
          header={t("settings.offline_status_header")}
          footer={t("settings.offline_status_footer")}
        >
          <View className="gap-2 px-4 py-2">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="flex-1 font-medium">
                {statusTitle(t, status)}
              </Text>
              {status.total > 0 ? (
                <Text color="tertiary" className="tabular-nums">
                  {status.ready} / {status.total}
                </Text>
              ) : null}
            </View>
            {status.total > 0 ? <DownloadProgress status={status} /> : null}
            <Text variant="footnote" color="tertiary">
              {t("settings.offline_storage_used", {
                used: formatStorageSize(usedBytes, getIntlLocale()),
                budget: formatStorageSize(
                  megabytesToBytes(prefs.budgetMb),
                  getIntlLocale(),
                ),
              })}
              {status.lastCheckedAt !== undefined
                ? t("settings.offline_checked_ago", {
                    ago: formatDistanceToNow(status.lastCheckedAt, {
                      addSuffix: true,
                      locale: getDateFnsLocale(),
                    }),
                  })
                : ""}
            </Text>
            {notes.map((note) => (
              <Text key={note} variant="footnote" color="tertiary">
                {note}
              </Text>
            ))}
          </View>
          <SettingsSeparator />
          <SettingsActionRow
            disabled={isBusy}
            isLoading={isBusy}
            label={t("settings.offline_download_now")}
            onPress={() => void refreshOfflineDownloads({ force: true })}
            tone="primary"
          />
        </SettingsGroup>
      ) : null}

      <View className="gap-1.5">
        <SectionHeader
          title={t("settings.offline_on_device")}
          detail={formatStorageSize(usedBytes, getIntlLocale())}
        />
        <SettingsGroup footer={t("settings.offline_downloads_include")}>
          <SettingsNavigationRow
            label={t("settings.offline_downloaded_articles")}
            onPress={() => router.push("/dashboard/settings/offline-articles")}
            value={String(offlineLibrary.length)}
          />
          {offlineLibrary.length > 0 || autoEnabled ? (
            <>
              <SettingsSeparator />
              <SettingsActionRow
                label={t("settings.offline_remove_all")}
                onPress={confirmRemoveAll}
              />
            </>
          ) : null}
        </SettingsGroup>
      </View>

      <View className="gap-1.5">
        <SectionHeader
          title={t("settings.offline_recent")}
          detail={formatStorageSize(recentCacheSize, getIntlLocale())}
        />
        <SettingsGroup>
          <SettingsActionRow
            label={t("settings.offline_clear_recent")}
            onPress={confirmClearRecentCache}
          />
        </SettingsGroup>
      </View>
    </SettingsScreen>
  );
}
