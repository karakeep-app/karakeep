import { View } from "react-native";
import {
  SettingsChoiceRow,
  SettingsGroup,
  SettingsScreen,
  SettingsSeparator,
} from "@/components/settings/settings-list";
import {
  getUploadQualityLabel,
  UPLOAD_QUALITY_OPTIONS,
} from "@/lib/settings-display";
import useAppSettings from "@/lib/settings";

export default function UploadSettings() {
  const { settings, setSettings, isLoading } = useAppSettings();
  const selectedLabel = getUploadQualityLabel(settings.imageQuality);

  return (
    <SettingsScreen>
      <SettingsGroup
        header="Image quality"
        footer="This controls image compression when adding an image bookmark."
      >
        {UPLOAD_QUALITY_OPTIONS.map((option, index) => {
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
