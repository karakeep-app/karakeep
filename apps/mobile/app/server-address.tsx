import { useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Stack, useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import useAppSettings from "@/lib/settings";
import { Plus, Trash2 } from "lucide-react-native";
import { useColorScheme } from "nativewind";

export default function ServerAddress() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === "dark" ? "#d1d5db" : "#374151";
  const { settings, setSettings } = useAppSettings();
  const [address, setAddress] = useState(
    settings.address ?? "https://cloud.karakeep.app",
  );
  const [error, setError] = useState<string | undefined>();

  // Custom headers state
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>(
    Object.entries(settings.customHeaders || {}).map(([key, value]) => ({
      key,
      value,
    })),
  );
  const [newHeaderKey, setNewHeaderKey] = useState("");
  const [newHeaderValue, setNewHeaderValue] = useState("");

  const handleAddHeader = () => {
    if (!newHeaderKey.trim() || !newHeaderValue.trim()) {
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
    // Validate the address
    if (!address.trim()) {
      setError("Server address is required");
      return;
    }

    if (!address.startsWith("http://") && !address.startsWith("https://")) {
      setError("Server address must start with http:// or https://");
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
    const cleanedAddress = address.trim().replace(/\/$/, "");
    setSettings({
      ...settings,
      address: cleanedAddress,
      customHeaders: headersObject,
    });
    router.back();
  };

  return (
    <CustomSafeAreaView>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={handleSave}>
              <Text className="text-base font-semibold text-blue-500">
                Save
              </Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAwareScrollView
        className="px-4"
        bottomOffset={20}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex w-full gap-4 py-4">
          <Text className="text-sm text-gray-600 dark:text-gray-400">
            Enter the URL of your Karakeep server. This should start with
            http:// or https://.
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

          {/* Custom Headers Section */}
          <View className="gap-2 border-t border-border pt-4">
            <Text className="text-base font-semibold">Custom Headers</Text>
            <Text className="text-sm text-gray-600 dark:text-gray-400">
              Add custom HTTP headers that will be sent with every API request.
            </Text>

            {/* Existing Headers List */}
            <View className="gap-2">
              {headers.length === 0 ? (
                <Text className="py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                  No custom headers configured
                </Text>
              ) : (
                headers.map((header, index) => (
                  <View
                    key={index}
                    className="flex-row items-center gap-2 rounded-lg border border-border bg-background p-3"
                  >
                    <View className="flex-1">
                      <Text className="text-sm font-semibold">
                        {header.key}
                      </Text>
                      <Text
                        className="text-xs text-gray-600 dark:text-gray-400"
                        numberOfLines={1}
                      >
                        {header.value}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleRemoveHeader(index)}
                      className="p-2"
                    >
                      <Trash2 size={18} color="#ef4444" />
                    </Pressable>
                  </View>
                ))
              )}
            </View>

            {/* Add New Header */}
            <View className="gap-2 border-t border-border pt-4">
              <Text className="text-sm font-semibold">Add New Header</Text>
              <Input
                placeholder="Header Name (e.g., X-Custom-Header)"
                value={newHeaderKey}
                onChangeText={setNewHeaderKey}
                autoCapitalize="none"
                inputClasses="bg-card"
              />
              <Input
                placeholder="Header Value"
                value={newHeaderValue}
                onChangeText={setNewHeaderValue}
                autoCapitalize="none"
                inputClasses="bg-card"
              />
              <Button
                variant="secondary"
                onPress={handleAddHeader}
                disabled={!newHeaderKey.trim() || !newHeaderValue.trim()}
              >
                <Plus size={16} color={iconColor} />
                <Text className="text-sm">Add Header</Text>
              </Button>
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </CustomSafeAreaView>
  );
}
