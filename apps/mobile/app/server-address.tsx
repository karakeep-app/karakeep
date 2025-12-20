import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Input } from "@/components/ui/Input";
import PageTitle from "@/components/ui/PageTitle";
import { Text } from "@/components/ui/Text";
import useAppSettings from "@/lib/settings";

export default function ServerAddress() {
  const router = useRouter();
  const { settings, setSettings } = useAppSettings();
  const [address, setAddress] = useState(
    settings.address ?? "https://cloud.karakeep.app",
  );
  const [error, setError] = useState<string | undefined>();

  const handleSave = () => {
    // Validate the address
    if (!address.trim()) {
      setError("Server address is required");
      return;
    }

    if (!address.startsWith("http://") && !address.startsWith("https://")) {
      setError("Server address must start with http:// or https://");
      return;
    }

    // Remove trailing slash and save
    const cleanedAddress = address.trim().replace(/\/$/, "");
    setSettings({
      ...settings,
      address: cleanedAddress,
    });
    router.back();
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <CustomSafeAreaView>
      <PageTitle title="Server Address" />
      <View className="flex h-full w-full gap-4 px-4 py-4">
        <Text className="text-sm text-gray-600 dark:text-gray-400">
          Enter the URL of your Karakeep server. This should start with http://
          or https://.
        </Text>

        {/* Error Message */}
        {error && (
          <View className="rounded-lg bg-red-50 p-3 dark:bg-red-950">
            <Text className="text-sm text-red-600 dark:text-red-400">
              {error}
            </Text>
          </View>
        )}

        {/* Server Address Input */}
        <View className="gap-2">
          <Text className="text-sm font-semibold">Server URL</Text>
          <Input
            placeholder="https://cloud.karakeep.app"
            value={address}
            onChangeText={(text) => {
              setAddress(text);
              setError(undefined);
            }}
            autoCapitalize="none"
            keyboardType="url"
            autoFocus
            inputClasses="bg-card"
          />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            Example: https://cloud.karakeep.app or http://localhost:3000
          </Text>
        </View>

        {/* Action Buttons */}
        <View className="flex flex-row gap-2">
          <Button
            variant="secondary"
            onPress={handleCancel}
            androidRootClassName="flex-1"
          >
            <Text>Cancel</Text>
          </Button>
          <Button
            variant="primary"
            onPress={handleSave}
            androidRootClassName="flex-1"
          >
            <Text>Save</Text>
          </Button>
        </View>
      </View>
    </CustomSafeAreaView>
  );
}
