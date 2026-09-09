import { useState } from "react";
import { Alert, TextInput } from "react-native";
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsScreen,
  SettingsSeparator,
} from "@/components/settings/settings-list";
import useAppSettings from "@/lib/settings";
import { DEFAULT_WIDGET_QUERY } from "@/widgets/search";

export default function WidgetSettings() {
  const { settings, setSettings, isLoading } = useAppSettings();
  const [query, setQuery] = useState<string>();
  const searchQuery = query ?? settings.widgetSearchQuery;
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await setSettings({ ...settings, widgetSearchQuery: searchQuery });
    } catch {
      Alert.alert("Unable to save", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsScreen>
      <SettingsGroup
        header="Search query"
        footer="Uses the same search syntax as Karakeep. Leave empty to show all bookmarks. This query applies to all your Karakeep widgets."
      >
        <TextInput
          accessibilityLabel="Widget search query"
          autoCapitalize="none"
          autoCorrect={false}
          className="px-4 py-3 text-foreground"
          value={searchQuery}
          editable={!isLoading && !saving}
          onChangeText={setQuery}
          placeholder={DEFAULT_WIDGET_QUERY}
          returnKeyType="done"
          onSubmitEditing={save}
        />
        <SettingsSeparator />
        <SettingsActionRow
          label="Save"
          tone="primary"
          disabled={
            isLoading || saving || searchQuery === settings.widgetSearchQuery
          }
          isLoading={saving}
          onPress={save}
        />
      </SettingsGroup>
      <SettingsGroup footer="Add Karakeep from your home screen's widget picker. Resize it by dragging its edges, and scroll to see up to 50 results. Tap a bookmark to open the reader, or tap refresh to update. The widget follows the app's Theme setting.">
        <SettingsActionRow
          label="Use default query"
          tone="default"
          onPress={() => setQuery(DEFAULT_WIDGET_QUERY)}
        />
      </SettingsGroup>
    </SettingsScreen>
  );
}
