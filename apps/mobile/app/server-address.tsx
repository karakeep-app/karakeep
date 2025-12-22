import { useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Stack, useRouter } from "expo-router";
import { Button } from "@/components/ui/Button";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Input } from "@/components/ui/Input";
import PageTitle from "@/components/ui/PageTitle";
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
          title: "Server Address",
          headerRight: () => (
            <Pressable onPress={handleSave}>
              <Text className="text-base font-semibold text-blue-500">
                Save
              </Text>
            </Pressable>
          ),
        }}
      />
      <PageTitle title="Server Address" />
      <KeyboardAwareScrollView
        className="w-full"
        contentContainerClassName="items-center gap-4 px-4 py-4"
        bottomOffset={20}
        keyboardShouldPersistTaps="handled"
      >
        {/* Error Message */}
        {error && (
          <View className="w-full rounded-lg bg-red-50 p-3 dark:bg-red-950">
            <Text className="text-center text-sm text-red-600 dark:text-red-400">
              {error}
            </Text>
          </View>
        )}

        {/* Server Address Section */}
        <View className="w-full">
          <Text className="mb-2 px-1 text-sm font-medium text-muted-foreground">
            Server URL
          </Text>
          <View className="w-full gap-3 rounded-lg bg-card px-4 py-4">
            <Text className="text-sm text-muted-foreground">
              Enter the URL of your Karakeep server
            </Text>
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
              inputClasses="bg-background"
            />
            <Text className="text-xs text-muted-foreground">
              Must start with http:// or https://
            </Text>
          </View>
        </View>

        {/* Custom Headers Section */}
        <View className="w-full">
          <Text className="mb-2 px-1 text-sm font-medium text-muted-foreground">
            Custom Headers
            {headers.length > 0 && (
              <Text className="text-muted-foreground"> ({headers.length})</Text>
            )}
          </Text>
          <View className="w-full gap-3 rounded-lg bg-card px-4 py-4">
            <Text className="text-sm text-muted-foreground">
              Add custom HTTP headers for API requests
            </Text>

            {/* Existing Headers List */}
            {headers.length === 0 ? (
              <View className="py-4">
                <Text className="text-center text-sm text-muted-foreground">
                  No custom headers configured
                </Text>
              </View>
            ) : (
              <View className="gap-2">
                {headers.map((header, index) => (
                  <View
                    key={index}
                    className="flex-row items-center gap-3 rounded-lg border border-border bg-background p-3"
                  >
                    <View className="flex-1 gap-1">
                      <Text className="text-sm font-semibold">
                        {header.key}
                      </Text>
                      <Text
                        className="text-xs text-muted-foreground"
                        numberOfLines={1}
                      >
                        {header.value}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleRemoveHeader(index)}
                      className="rounded-md p-2"
                      hitSlop={8}
                    >
                      <Trash2 size={18} color="#ef4444" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {/* Add New Header Form */}
            <View className="gap-2 border-t border-border pt-4">
              <Text className="text-sm font-medium">Add New Header</Text>
              <Input
                placeholder="Header Name (e.g., X-Custom-Header)"
                value={newHeaderKey}
                onChangeText={setNewHeaderKey}
                autoCapitalize="none"
                inputClasses="bg-background"
              />
              <Input
                placeholder="Header Value"
                value={newHeaderValue}
                onChangeText={setNewHeaderValue}
                autoCapitalize="none"
                inputClasses="bg-background"
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
