import { View } from "react-native";
import {
  SettingsChoiceRow,
  SettingsGroup,
  SettingsScreen,
  SettingsSeparator,
} from "@/components/settings/settings-list";
import { getSystemLanguage, SUPPORTED_LANGUAGES } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";
import useAppSettings from "@/lib/settings";

import { langNameMappings } from "@karakeep/shared/langs";

export default function LanguagePage() {
  const { settings, setSettings } = useAppSettings();
  const { t } = useTranslation();

  const systemLanguage = getSystemLanguage();
  const current = settings.language ?? "system";

  const options: { value: string; label: string }[] = [
    {
      value: "system",
      label: t("settings.language_system", {
        language: langNameMappings[systemLanguage] ?? systemLanguage,
      }),
    },
    ...SUPPORTED_LANGUAGES.map((lang) => ({
      value: lang,
      label: langNameMappings[lang] ?? lang,
    })),
  ];

  return (
    <SettingsScreen>
      <SettingsGroup footer={t("settings.language_hint")}>
        {options.map((option, index) => (
          <View key={option.value}>
            {index > 0 ? <SettingsSeparator /> : null}
            <SettingsChoiceRow
              label={option.label}
              onPress={() =>
                setSettings({ ...settings, language: option.value })
              }
              selected={current === option.value}
            />
          </View>
        ))}
      </SettingsGroup>
    </SettingsScreen>
  );
}
