import { View } from "react-native";
import { useRouter } from "expo-router";
import {
  SettingsChoiceRow,
  SettingsGroup,
  SettingsScreen,
  SettingsSeparator,
} from "@/components/settings/settings-list";
import { useToast } from "@/components/ui/Toast";
import useAppSettings from "@/lib/settings";

export default function BookmarkDefaultViewSettings() {
  const router = useRouter();
  const { toast } = useToast();
  const { settings, setSettings } = useAppSettings();

  const handleUpdate = async (
    mode: "reader" | "browser" | "externalBrowser",
  ) => {
    try {
      await setSettings({
        ...settings,
        defaultBookmarkView: mode,
      });
      toast({
        message: "Bookmark opening preference updated",
        showProgress: false,
      });
      router.back();
    } catch {
      toast({
        message: "Something went wrong",
        variant: "destructive",
        showProgress: false,
      });
    }
  };

  const modes = ["reader", "browser", "externalBrowser"] as const;

  return (
    <SettingsScreen>
      <SettingsGroup footer="Choose what opens when you tap a bookmark.">
        {modes.map((mode, index) => (
          <View key={mode}>
            {index > 0 ? <SettingsSeparator /> : null}
            <SettingsChoiceRow
              label={
                {
                  browser: "Browser",
                  externalBrowser: "External Browser",
                  reader: "Reader",
                }[mode]
              }
              onPress={() => void handleUpdate(mode)}
              selected={settings.defaultBookmarkView === mode}
            />
          </View>
        ))}
      </SettingsGroup>
    </SettingsScreen>
  );
}
