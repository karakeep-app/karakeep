import { useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsScreen,
  SettingsSeparator,
  SettingsToggleRow,
} from "@/components/settings/settings-list";
import EmptyState from "@/components/ui/EmptyState";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { clearPersistedCache, usePersistedCacheSize } from "@/lib/offlineCache";
import {
  getOfflineLibraryScope,
  reconcileOfflineLibrary,
  removeAllOfflineArticles,
  removeOfflineArticle,
  useOfflineLibrary,
  useOfflineLibrarySize,
} from "@/lib/offlineLibrary";
import useAppSettings from "@/lib/settings";
import type { Settings } from "@/lib/settings";
import { useAutomaticOffline } from "@/lib/automaticOffline";
import { useConnectionStatus } from "@/lib/useConnectionStatus";
import { useColorScheme } from "@/lib/useColorScheme";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, Trash2 } from "lucide-react-native";

const storageSizeFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

function formatStorageSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${storageSizeFormatter.format(value)} ${units[unitIndex]}`;
}

function CacheSectionHeader({ title, size }: { title: string; size: number }) {
  return (
    <View className="flex-row items-center justify-between px-1 pb-2">
      <Text className="text-xs uppercase tracking-wide text-muted-foreground">
        {title}
      </Text>
      <Text className="text-xs tabular-nums text-muted-foreground">
        {formatStorageSize(size)}
      </Text>
    </View>
  );
}

export default function OfflineContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { settings, setSettings } = useAppSettings();
  const { state: sync, blockedReason, refresh, cancel } = useAutomaticOffline();
  const connection = useConnectionStatus();
  const [count, setCount] = useState(
    String(settings.automaticOfflineCount || 100),
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const { colors } = useColorScheme();
  const scope = getOfflineLibraryScope(settings);
  const offlineLibrary = useOfflineLibrary(scope);
  const offlineLibrarySize = useOfflineLibrarySize();
  const recentCacheSize = usePersistedCacheSize();

  const updateDownloadSettings = async (changes: Partial<Settings>) => {
    setSavingSettings(true);
    try {
      await setSettings({ ...settings, ...changes });
      return true;
    } catch {
      toast({
        message: "Could not save download settings.",
        variant: "destructive",
      });
      return false;
    } finally {
      setSavingSettings(false);
    }
  };

  const applyCount = () => {
    const value = Number(count);
    if (
      !/^\d+$/.test(count) ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 1000
    ) {
      toast({
        message: "Choose between 1 and 1000 articles.",
        variant: "destructive",
      });
      return;
    }
    void updateDownloadSettings({ automaticOfflineCount: value });
  };

  useEffect(() => {
    reconcileOfflineLibrary(scope);
  }, [scope]);

  const confirmRemove = (bookmarkId: string, displayTitle: string) => {
    Alert.alert(
      "Remove offline copy?",
      `"${displayTitle}" will be removed. Automatic downloads may save it again if it is still recent.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeOfflineArticle(scope, bookmarkId),
        },
      ],
    );
  };

  const confirmRemoveAll = () => {
    Alert.alert(
      "Remove all offline content?",
      "This removes manual and automatic offline copies and turns off automatic downloads.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove All",
          style: "destructive",
          onPress: async () => {
            cancel();
            if (await updateDownloadSettings({ automaticOfflineCount: 0 }))
              removeAllOfflineArticles(scope);
          },
        },
      ],
    );
  };

  const confirmClearRecentCache = () => {
    Alert.alert(
      "Clear recent cache?",
      "Saved offline articles will be kept. Anything else will be re-cached as you browse.",
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

  return (
    <SettingsScreen>
      <Text className="px-1 text-sm text-muted-foreground">
        Saved offline articles stay on this device. Everything else is cached
        only as you browse and can be cleared at any time.
      </Text>

      <SettingsGroup
        header="Automatic downloads"
        footer="Downloads run while the app is open and connected, at most every 15 minutes. Wi-Fi and charging restrictions also apply to Download now. A full or paused battery on power counts as charging. Article text is saved; remote images and full archived pages may still need a connection. Manual saves are never removed by automatic cleanup."
      >
        <SettingsToggleRow
          label="Keep recent articles offline"
          value={settings.automaticOfflineCount > 0}
          disabled={savingSettings}
          onValueChange={(enabled) => {
            if (enabled) applyCount();
            else {
              cancel();
              void updateDownloadSettings({ automaticOfflineCount: 0 });
            }
          }}
        />
        <SettingsSeparator />
        <SettingsToggleRow
          label="Exclude archived articles"
          value={settings.automaticOfflineExcludeArchived}
          disabled={savingSettings}
          onValueChange={(enabled) => {
            cancel();
            void updateDownloadSettings({
              automaticOfflineExcludeArchived: enabled,
            });
          }}
        />
        <SettingsSeparator />
        <SettingsToggleRow
          label="Download only on Wi-Fi"
          value={settings.automaticOfflineWifiOnly}
          disabled={savingSettings}
          onValueChange={(enabled) => {
            cancel();
            void updateDownloadSettings({ automaticOfflineWifiOnly: enabled });
          }}
        />
        <SettingsSeparator />
        <SettingsToggleRow
          label="Download only while charging"
          value={settings.automaticOfflineChargingOnly}
          disabled={savingSettings}
          onValueChange={(enabled) => {
            cancel();
            void updateDownloadSettings({
              automaticOfflineChargingOnly: enabled,
            });
          }}
        />
        <View className="px-4 py-2">
          <Input
            accessibilityLabel="Number of recent articles to keep offline"
            label="Number of articles (1–1000)"
            keyboardType="number-pad"
            value={count}
            onChangeText={setCount}
            editable={!savingSettings}
            maxLength={4}
          />
        </View>
        {settings.automaticOfflineCount > 0 ? (
          <>
            <SettingsActionRow
              label="Apply article count"
              tone="primary"
              disabled={savingSettings}
              onPress={applyCount}
            />
            <SettingsSeparator />
            <SettingsActionRow
              label={
                sync.running
                  ? "Cancel downloads"
                  : "Download recent articles now"
              }
              tone="primary"
              disabled={
                !sync.running &&
                (savingSettings || connection !== "online" || !!blockedReason)
              }
              onPress={sync.running ? cancel : refresh}
            />
          </>
        ) : null}
        {blockedReason && settings.automaticOfflineCount > 0 ? (
          <Text className="px-4 py-2 text-sm text-muted-foreground">
            {blockedReason}
          </Text>
        ) : null}
        {sync.running || sync.message ? (
          <Text
            accessibilityLiveRegion="polite"
            className="px-4 py-2 text-sm text-muted-foreground"
          >
            {sync.running
              ? `Downloading ${sync.completed} of ${sync.total} articles…`
              : sync.message}
          </Text>
        ) : null}
        {connection !== "online" && settings.automaticOfflineCount > 0 ? (
          <Text className="px-4 py-2 text-sm text-muted-foreground">
            Connect to your server to download articles.
          </Text>
        ) : null}
      </SettingsGroup>

      <View className="gap-4">
        <View className="gap-2">
          <CacheSectionHeader
            title="Saved offline content"
            size={offlineLibrarySize}
          />

          {offlineLibrary.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No saved offline articles"
              subtitle="Open an article and choose Make available offline."
            />
          ) : (
            <SettingsGroup>
              {offlineLibrary.map((item, index) => (
                <View key={item.bookmarkId}>
                  {index > 0 ? <SettingsSeparator /> : null}
                  <View className="flex-row items-center px-4 py-3">
                    <Pressable
                      className="min-w-0 flex-1"
                      onPress={() =>
                        router.push(`/dashboard/bookmarks/${item.bookmarkId}`)
                      }
                    >
                      <Text className="font-medium" numberOfLines={2}>
                        {item.displayTitle}
                      </Text>
                      {item.url ? (
                        <Text
                          className="mt-0.5 text-xs text-muted-foreground"
                          numberOfLines={1}
                        >
                          {item.url}
                        </Text>
                      ) : null}
                      <Text className="mt-1 text-xs text-muted-foreground">
                        {item.automatic ? "Automatically saved " : "Saved "}
                        {formatDistanceToNow(item.savedAt, { addSuffix: true })}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Remove ${item.displayTitle} offline copy`}
                      className="ml-3 p-2"
                      onPress={() =>
                        confirmRemove(item.bookmarkId, item.displayTitle)
                      }
                    >
                      <Trash2 size={18} color={colors.destructive} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </SettingsGroup>
          )}
        </View>

        {offlineLibrary.length > 0 ? (
          <SettingsGroup>
            <SettingsActionRow
              centered
              label="Remove all offline content"
              onPress={confirmRemoveAll}
            />
          </SettingsGroup>
        ) : null}
      </View>

      <View className="gap-2">
        <CacheSectionHeader title="Recent cache" size={recentCacheSize} />
        <SettingsGroup>
          <SettingsActionRow
            centered
            label="Clear recent cache"
            onPress={confirmClearRecentCache}
          />
        </SettingsGroup>
      </View>
    </SettingsScreen>
  );
}
