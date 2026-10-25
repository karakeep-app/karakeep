import { View } from "react-native";
import {
  SettingsChoiceRow,
  SettingsGroup,
  SettingsScreen,
  SettingsSeparator,
} from "@/components/settings/settings-list";
import { useTranslation } from "@/lib/i18n/hooks";
import useAppSettings from "@/lib/settings";

export default function ThemePage() {
  const { settings, setSettings } = useAppSettings();
  const { t } = useTranslation();

  const themes = ["light", "dark", "system"] as const;

  return (
    <SettingsScreen>
      <SettingsGroup>
        {themes.map((theme, index) => (
          <View key={theme}>
            {index > 0 ? <SettingsSeparator /> : null}
            <SettingsChoiceRow
              label={
                {
                  dark: t("settings.theme_dark"),
                  light: t("settings.theme_light"),
                  system: t("settings.theme_system"),
                }[theme]
              }
              onPress={() => setSettings({ ...settings, theme })}
              selected={settings.theme === theme}
            />
          </View>
        ))}
      </SettingsGroup>
    </SettingsScreen>
  );
}
