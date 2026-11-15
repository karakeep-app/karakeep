import { View } from "react-native";
import {
  SettingsChoiceRow,
  SettingsGroup,
  SettingsScreen,
  SettingsSeparator,
} from "@/components/settings/settings-list";
import { useTranslation } from "@/lib/i18n/hooks";
import { getUploadQualityOptions } from "@/lib/settings-display";
import useAppSettings from "@/lib/settings";

export default function UploadSettings() {
  const { settings, setSettings, isLoading } = useAppSettings();
  const { t } = useTranslation();
  const uploadQualityOptions = getUploadQualityOptions();
  const selectedLabel =
    uploadQualityOptions.find(
      (option) =>
        Math.abs(option.value - settings.imageQuality) ===
        Math.min(
          ...uploadQualityOptions.map((o) =>
            Math.abs(o.value - settings.imageQuality),
          ),
        ),
    )?.label ?? uploadQualityOptions[0].label;

  return (
    <SettingsScreen>
      <SettingsGroup
        header={t("settings.uploads_image_quality")}
        footer={t("settings.uploads_hint")}
      >
        {uploadQualityOptions.map((option, index) => {
          const isSelected = selectedLabel === option.label;

          return (
            <View key={option.label}>
              {index > 0 ? <SettingsSeparator /> : null}
              <SettingsChoiceRow
                description={option.description}
                disabled={isLoading}
                label={option.label}
                onPress={() =>
                  setSettings({
                    ...settings,
                    imageQuality: option.value,
                  })
                }
                selected={isSelected}
              />
            </View>
          );
        })}
      </SettingsGroup>
    </SettingsScreen>
  );
}
