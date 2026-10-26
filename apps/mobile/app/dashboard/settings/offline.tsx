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

const RECENT_LIMIT_MENU = RECENT_LIMIT_OPTIONS.map((value) => ({
  value,
  label: `${value} articles`,
}));

const BUDGET_MENU = BUDGET_MB_OPTIONS.map((value) => ({
  value,
  label: formatStorageSize(megabytesToBytes(value)),
}));

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function statusTitle(status: OfflineSyncStatus) {
  switch (status.phase) {
    case "checking":
      return "Checking for new articles…";
    case "downloading":
      return "Downloading articles…";
    case "wifi":
      return "Waiting for Wi-Fi";
    case "offline":
      return "Waiting for a connection";
    case "paused":
      return "Paused";
    case "error":
      return "Couldn't check for new articles";
    case "ready":
      if (status.budgetReached) {
        return "Storage limit reached";
      }
      return status.failed > 0 ? "Some articles are missing" : "Up to date";
    case "idle":
    case "disabled":
      return "Not checked yet";
  }
}

function statusNotes(status: OfflineSyncStatus) {
  const notes: string[] = [];
  if (status.phase === "error") {
    notes.push("Articles that were already downloaded are still available.");
  }
  if (status.failed > 0) {
    notes.push(
      `${pluralize(status.failed, "article")} couldn't be downloaded yet. Some may still be processing on the server.`,
    );
  }
  if (status.budgetReached) {
    notes.push(
      "Raise the storage limit or keep fewer articles to download the rest.",
    );
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

  const confirmRemoveAll = () => {
    Alert.alert(
      "Remove all offline content?",
      "Every downloaded article is removed from this device, and automatic downloads are turned off.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove All",
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
      "Clear recent cache?",
      "Downloaded articles are kept. Everything else will be cached again as you browse.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Cache",
          style: "destructive",
          onPress: () => {
            queryClient.clear();
            clearPersistedCache();
            toast({ message: "Recent cache cleared" });
          },
        },
      ],
    );
  };

  const notes = statusNotes(status);

  return (
    <SettingsScreen>
      <Text className="px-1 text-sm text-muted-foreground">
        Keep articles on this device so you can read them without a connection.
      </Text>

      <SettingsGroup
        header="Automatic downloads"
        footer="Recent articles keeps your newest unarchived articles, replacing the oldest as new ones arrive."
      >
        <SettingsToggleRow
          label="Recent articles"
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
              label="Keep"
              onSelect={(recentLimit) =>
                updateOfflineDownloadPrefs(scope, (current) => ({
                  ...current,
                  recentLimit,
                }))
              }
              options={RECENT_LIMIT_MENU}
              value={prefs.recentLimit}
            />
          </>
        ) : null}
        <SettingsSeparator />
        <SettingsNavigationRow
          label="Lists"
          onPress={() => router.push("/dashboard/settings/offline-lists")}
          value={
            prefs.listIds.length > 0
              ? `${prefs.listIds.length} selected`
              : "None"
          }
        />
      </SettingsGroup>

      <SettingsGroup
        header="Storage & network"
        footer="Lists take priority over recent articles when space runs out. Articles you save yourself are never removed automatically."
      >
        <SettingsMenuRow
          label="Storage limit"
          onSelect={(budgetMb) =>
            updateOfflineDownloadPrefs(scope, (current) => ({
              ...current,
              budgetMb,
            }))
          }
          options={BUDGET_MENU}
          value={prefs.budgetMb}
        />
        <SettingsSeparator />
        <SettingsToggleRow
          label="Download only on Wi-Fi"
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
          header="Status"
          footer="Articles download while the app is open. Open it before going offline to be sure you have the latest."
        >
          <View className="gap-2 px-4 py-2">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="flex-1 font-medium">{statusTitle(status)}</Text>
              {status.total > 0 ? (
                <Text color="tertiary" className="tabular-nums">
                  {status.ready} / {status.total}
                </Text>
              ) : null}
            </View>
            {status.total > 0 ? <DownloadProgress status={status} /> : null}
            <Text variant="footnote" color="tertiary">
              {formatStorageSize(usedBytes)} of{" "}
              {formatStorageSize(megabytesToBytes(prefs.budgetMb))} used
              {status.lastCheckedAt !== undefined
                ? ` · Checked ${formatDistanceToNow(status.lastCheckedAt, { addSuffix: true })}`
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
            label="Download now"
            onPress={() => void refreshOfflineDownloads({ force: true })}
            tone="primary"
          />
        </SettingsGroup>
      ) : null}

      <View className="gap-1.5">
        <SectionHeader
          title="On this device"
          detail={formatStorageSize(usedBytes)}
        />
        <SettingsGroup footer="Downloads include the article text and its images. Videos, PDFs and other attachments aren't downloaded.">
          <SettingsNavigationRow
            label="Downloaded articles"
            onPress={() => router.push("/dashboard/settings/offline-articles")}
            value={String(offlineLibrary.length)}
          />
          {offlineLibrary.length > 0 || autoEnabled ? (
            <>
              <SettingsSeparator />
              <SettingsActionRow
                label="Remove all offline content"
                onPress={confirmRemoveAll}
              />
            </>
          ) : null}
        </SettingsGroup>
      </View>

      <View className="gap-1.5">
        <SectionHeader
          title="Recent cache"
          detail={formatStorageSize(recentCacheSize)}
        />
        <SettingsGroup>
          <SettingsActionRow
            label="Clear recent cache"
            onPress={confirmClearRecentCache}
          />
        </SettingsGroup>
      </View>
    </SettingsScreen>
  );
}
