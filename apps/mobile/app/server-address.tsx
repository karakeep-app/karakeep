import { useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { GroupedSection, RowSeparator } from "@/components/ui/GroupedList";
import { Input } from "@/components/ui/Input";
import { SheetHeader, useDiscardGuard } from "@/components/ui/SheetHeader";
import { Text } from "@/components/ui/Text";
import { useCommonStrings, useTranslation } from "@/lib/i18n/hooks";
import useAppSettings from "@/lib/settings";
import { useColorScheme } from "@/lib/useColorScheme";
import { Plus, Trash2 } from "lucide-react-native";

export default function ServerAddress() {
  const router = useRouter();
  const { t } = useTranslation();
  const { name: nameLabel } = useCommonStrings();
  const { colors } = useColorScheme();
  const { settings, setSettings } = useAppSettings();
  const [address, setAddress] = useState(
    settings.address ?? "https://cloud.karakeep.com",
  );
  const [error, setError] = useState<string | undefined>();
  const allowLeave = useDiscardGuard(
    address !== (settings.address ?? "https://cloud.karakeep.com"),
  );

  // Custom headers state
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>(
    Object.entries(settings.customHeaders || {}).map(([key, value]) => ({
      key,
      value,
    })),
  );
  const [newHeaderKey, setNewHeaderKey] = useState("");
  const [newHeaderValue, setNewHeaderValue] = useState("");

  const canAddHeader =
    newHeaderKey.trim().length > 0 && newHeaderValue.trim().length > 0;

  const handleAddHeader = () => {
    if (!canAddHeader) {
      return;
    }

    // Check if header already exists
    const existingIndex = headers.findIndex((h) => h.key === newHeaderKey);
    if (existingIndex >= 0) {
      // Update existing header
      const updatedHeaders = [...headers];
      updatedHeaders[existingIndex].value = newHeaderValue;
      setHeaders(updatedHeaders);
    } else {
      // Add new header
      setHeaders([...headers, { key: newHeaderKey, value: newHeaderValue }]);
    }

    setNewHeaderKey("");
    setNewHeaderValue("");
  };

  const handleRemoveHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      setError(t("server_address.enter_address"));
      return;
    }

    if (
      !trimmedAddress.startsWith("http://") &&
      !trimmedAddress.startsWith("https://")
    ) {
      setError(t("server_address.address_protocol"));
      return;
    }

    // Convert headers array to object
    const headersObject = headers.reduce(
      (acc, { key, value }) => {
        if (key.trim() && value.trim()) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, string>,
    );

    // Remove trailing slash and save
    const cleanedAddress = trimmedAddress.replace(/\/$/, "");
    setSettings({
      ...settings,
      address: cleanedAddress,
      customHeaders: headersObject,
    });
    allowLeave();
    router.back();
  };

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{
        gap: 24,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 96,
      }}
      bottomOffset={20}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentInsetAdjustmentBehavior="automatic"
    >
      <SheetHeader onSave={handleSave} saveDisabled={!address.trim()} />

      <View className="gap-1.5">
        <GroupedSection header={t("headers.server_address")}>
          <Input
            accessibilityLabel={t("server_address.address_label")}
            placeholder="https://cloud.karakeep.com"
            value={address}
            onChangeText={(text) => {
              setAddress(text);
              setError(undefined);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            selectTextOnFocus
            clearButtonMode="while-editing"
            returnKeyType="done"
            onSubmitEditing={handleSave}
            autoFocus
          />
        </GroupedSection>
        {error ? (
          <Text variant="footnote" className="px-4 text-destructive">
            {error}
          </Text>
        ) : (
          <Text variant="footnote" color="tertiary" className="px-4">
            {t("server_address.address_footer")}
          </Text>
        )}
      </View>

      <GroupedSection
        header={t("server_address.custom_headers_advanced")}
        footer={t("server_address.custom_headers_footer")}
      >
        {headers.map((header, index) => (
          <View key={index}>
            <View className="min-h-11 flex-row items-center gap-3 px-4 py-2">
              <View className="flex-1">
                <Text variant="subhead" numberOfLines={1}>
                  {header.key}
                </Text>
                <Text variant="footnote" color="tertiary" numberOfLines={1}>
                  {header.value}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("server_address.remove_header", {
                  name: header.key,
                })}
                onPress={() => handleRemoveHeader(index)}
                hitSlop={10}
              >
                <Trash2 size={18} color={colors.destructive} />
              </Pressable>
            </View>
            <RowSeparator />
          </View>
        ))}
        <Input
          accessibilityLabel={t("server_address.header_name")}
          placeholder={nameLabel}
          value={newHeaderKey}
          onChangeText={setNewHeaderKey}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <RowSeparator />
        <Input
          accessibilityLabel={t("server_address.header_value")}
          placeholder={t("server_address.value")}
          value={newHeaderValue}
          onChangeText={setNewHeaderValue}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <RowSeparator />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAddHeader }}
          disabled={!canAddHeader}
          onPress={handleAddHeader}
          className={
            canAddHeader
              ? "min-h-11 flex-row items-center gap-2 px-4 py-2.5 active:opacity-60"
              : "min-h-11 flex-row items-center gap-2 px-4 py-2.5 opacity-40"
          }
        >
          <Plus size={18} color={colors.primary} />
          <Text className="text-primary">{t("server_address.add_header")}</Text>
        </Pressable>
      </GroupedSection>
    </KeyboardAwareScrollView>
  );
}
