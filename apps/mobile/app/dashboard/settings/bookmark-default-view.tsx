import { View } from "react-native";
import { useRouter } from "expo-router";
import {
  SettingsChoiceRow,
  SettingsGroup,
  SettingsScreen,
  SettingsSeparator,
} from "@/components/settings/settings-list";
import { useToast } from "@/components/ui/Toast";
import { useCommonStrings, useTranslation } from "@/lib/i18n/hooks";
import useAppSettings from "@/lib/settings";

export default function BookmarkDefaultViewSettings() {
  const router = useRouter();
  const { toast } = useToast();
  const { settings, setSettings } = useAppSettings();
  const { t } = useTranslation();
  const strings = useCommonStrings();

  const handleUpdate = async (
    mode: "reader" | "browser" | "externalBrowser",
  ) => {
    try {
      await setSettings({
        ...settings,
        defaultBookmarkView: mode,
      });
      toast({
        message: t("settings.open_in_updated"),
        showProgress: false,
      });
      router.back();
    } catch {
      toast({
        message: strings.somethingWentWrong,
        variant: "destructive",
        showProgress: false,
      });
    }
  };

  const modes = ["reader", "browser", "externalBrowser"] as const;

  return (
    <SettingsScreen>
      <SettingsGroup footer={t("settings.open_in_hint")}>
        {modes.map((mode, index) => (
          <View key={mode}>
            {index > 0 ? <SettingsSeparator /> : null}
            <SettingsChoiceRow
              label={
                {
                  browser: t("settings.open_in_browser"),
                  externalBrowser: t("settings.open_in_external"),
                  reader: t("settings.open_in_reader"),
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
