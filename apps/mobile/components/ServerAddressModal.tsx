import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { X } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Text } from "./ui/Text";

interface ServerAddressModalProps {
  visible: boolean;
  currentAddress: string;
  onClose: () => void;
  onSave: (address: string) => void;
}

export function ServerAddressModal({
  visible,
  currentAddress,
  onClose,
  onSave,
}: ServerAddressModalProps) {
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === "dark" ? "#d1d5db" : "#374151";

  const [address, setAddress] = useState(currentAddress);
  const [error, setError] = useState<string | undefined>();

  const handleSave = () => {
    // Validate the address
    if (!address.trim()) {
      setError("Server address is required");
      return;
    }

    if (
      !address.startsWith("http://") &&
      !address.startsWith("https://")
    ) {
      setError("Server address must start with http:// or https://");
      return;
    }

    // Remove trailing slash and save
    const cleanedAddress = address.trim().replace(/\/$/, "");
    onSave(cleanedAddress);
    setError(undefined);
    onClose();
  };

  const handleCancel = () => {
    // Reset to original address
    setAddress(currentAddress);
    setError(undefined);
    onClose();
  };

  // Update local state when currentAddress changes (e.g., when modal opens)
  const handleOpen = () => {
    setAddress(currentAddress);
    setError(undefined);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
      onShow={handleOpen}
    >
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0 bg-black/50"
          onPress={handleCancel}
        />
        <View className="max-h-[85%] rounded-t-3xl bg-card">
          <KeyboardAwareScrollView
            contentContainerClassName="p-6"
            bottomOffset={20}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View className="mb-4 flex flex-row items-center justify-between">
              <Text className="text-lg font-semibold">Server Address</Text>
              <Pressable onPress={handleCancel} className="p-2">
                <X size={24} color={iconColor} />
              </Pressable>
            </View>

            <Text className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Enter the URL of your Karakeep server. This should start with
              http:// or https://.
            </Text>

            {/* Error Message */}
            {error && (
              <View className="mb-4 rounded-lg bg-red-50 p-3 dark:bg-red-950">
                <Text className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </Text>
              </View>
            )}

            {/* Server Address Input */}
            <View className="mb-4 gap-2">
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
                inputClasses="bg-background"
              />
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Example: https://cloud.karakeep.app or
                http://localhost:3000
              </Text>
            </View>

            {/* Action Buttons */}
            <View className="flex flex-row gap-2 border-t border-border pt-4">
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
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}
