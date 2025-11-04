import { useState } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Plus, Trash2, X } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Text } from "./ui/Text";

interface CustomHeadersModalProps {
  visible: boolean;
  customHeaders: Record<string, string>;
  onClose: () => void;
  onSave: (headers: Record<string, string>) => void;
}

export function CustomHeadersModal({
  visible,
  customHeaders,
  onClose,
  onSave,
}: CustomHeadersModalProps) {
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === "dark" ? "#d1d5db" : "#374151";

  // Convert headers object to array of entries for easier manipulation
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>(
    Object.entries(customHeaders).map(([key, value]) => ({ key, value })),
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
    // Convert array back to object
    const headersObject = headers.reduce(
      (acc, { key, value }) => {
        if (key.trim() && value.trim()) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, string>,
    );

    onSave(headersObject);
    onClose();
  };

  const handleCancel = () => {
    // Reset to original headers
    setHeaders(
      Object.entries(customHeaders).map(([key, value]) => ({ key, value })),
    );
    setNewHeaderKey("");
    setNewHeaderValue("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="max-h-[85%] rounded-t-3xl bg-card p-6">
            {/* Header */}
            <View className="mb-4 flex flex-row items-center justify-between">
              <Text className="text-lg font-semibold">Custom Headers</Text>
              <Pressable onPress={handleCancel} className="p-2">
                <X size={24} color={iconColor} />
              </Pressable>
            </View>

            <Text className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Add custom HTTP headers that will be sent with every API request.
            </Text>

            {/* Existing Headers List */}
            <ScrollView className="mb-4 max-h-64">
              {headers.length === 0 ? (
                <Text className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  No custom headers configured
                </Text>
              ) : (
                <View className="gap-2">
                  {headers.map((header, index) => (
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
                  ))}
                </View>
              )}
            </ScrollView>

            {/* Add New Header */}
            <View className="gap-2 border-t border-border pt-4">
              <Text className="text-sm font-semibold">Add New Header</Text>
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

            {/* Action Buttons */}
            <View className="mt-4 flex flex-row gap-2 border-t border-border pt-4">
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
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
