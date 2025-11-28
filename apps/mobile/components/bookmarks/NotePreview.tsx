import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { ExternalLink, NotepadText, X } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { Button } from "../ui/Button";
import { Text } from "../ui/Text";

interface NotePreviewProps {
  note: string;
  bookmarkId: string;
  readOnly?: boolean;
}

export function NotePreview({
  note,
  bookmarkId,
  readOnly = false,
}: NotePreviewProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === "dark" ? "#9ca3af" : "#6b7280";
  const modalIconColor = colorScheme === "dark" ? "#d1d5db" : "#374151";

  if (!note?.trim()) {
    return null;
  }

  return (
    <>
      <Pressable onPress={() => setIsModalVisible(true)}>
        <View className="flex flex-row items-center gap-2">
          <NotepadText size={24} color={iconColor} />
          <Text
            className="flex-1 text-sm italic text-gray-500 dark:text-gray-400"
            numberOfLines={2}
          >
            {note}
          </Text>
        </View>
      </Pressable>

      <Modal
        visible={isModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="max-h-[80%] rounded-t-3xl bg-card p-6">
            {/* Header */}
            <View className="mb-4 flex flex-row items-center justify-between">
              <Text className="text-lg font-semibold">Note</Text>
              <Pressable
                onPress={() => setIsModalVisible(false)}
                className="p-2"
              >
                <X size={24} color={modalIconColor} />
              </Pressable>
            </View>

            {/* Note Content */}
            <ScrollView className="mb-4 max-h-96">
              <Text className="text-sm text-gray-700 dark:text-gray-300">
                {note}
              </Text>
            </ScrollView>

            {/* Action Button */}
            {!readOnly && (
              <View className="flex flex-row justify-end border-t border-border pt-4">
                <Button
                  variant="secondary"
                  onPress={() => {
                    setIsModalVisible(false);
                    router.push(`/dashboard/bookmarks/${bookmarkId}/info`);
                  }}
                >
                  <Text className="text-sm">Edit Notes</Text>
                  <ExternalLink size={14} color={modalIconColor} />
                </Button>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
