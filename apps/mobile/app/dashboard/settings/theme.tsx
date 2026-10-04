import { View } from "react-native";
import {
  SettingsChoiceRow,
  SettingsGroup,
  SettingsScreen,
  SettingsSeparator,
} from "@/components/settings/settings-list";
import useAppSettings from "@/lib/settings";

export default function ThemePage() {
  const { settings, setSettings } = useAppSettings();

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
                  dark: "Dark Mode",
                  light: "Light Mode",
                  system: "System",
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
