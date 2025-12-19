import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Copy, RotateCcw, X } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Text } from "../ui/Text";
import { useToast } from "../ui/Toast";
import { Divider } from "../ui/Divider";

import { ZBookmarkList } from "@karakeep/shared/types/lists";
import { useEditBookmarkList } from "@karakeep/shared-react/hooks/lists";
import { api } from "@/lib/trpc";
import useAppSettings from "@/lib/settings";

interface ShareListModalProps {
  visible: boolean;
  list: ZBookmarkList;
  onClose: () => void;
}

export function ShareListModal({
  visible,
  list,
  onClose,
}: ShareListModalProps) {
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === "dark" ? "#d1d5db" : "#374151";
  const { toast } = useToast();
  const { settings } = useAppSettings();
  const apiUtils = api.useUtils();

  const { mutate: editList, isPending: isEditingList } = useEditBookmarkList();

  const { mutate: regenRssToken, isPending: isRegenPending } =
    api.lists.regenRssToken.useMutation({
      onSuccess: () => {
        apiUtils.lists.getRssToken.invalidate({ listId: list.id });
        toast({
          message: "RSS token regenerated",
          showProgress: false,
        });
      },
    });

  const { mutate: clearRssToken, isPending: isClearPending } =
    api.lists.clearRssToken.useMutation({
      onSuccess: () => {
        apiUtils.lists.getRssToken.invalidate({ listId: list.id });
        toast({
          message: "RSS feed disabled",
          showProgress: false,
        });
      },
    });

  const { data: rssToken, isLoading: isTokenLoading } =
    api.lists.getRssToken.useQuery(
      { listId: list.id },
      { enabled: visible },
    );

  const publicListUrl = `${settings.address}/public/lists/${list.id}`;
  const rssUrl =
    rssToken?.token
      ? `${settings.address}/api/v1/rss/lists/${list.id}?token=${rssToken.token}`
      : null;

  const handleCopyPublicUrl = async () => {
    await Clipboard.setStringAsync(publicListUrl);
    toast({
      message: "Link copied to clipboard",
      showProgress: false,
    });
  };

  const handleCopyRssUrl = async () => {
    if (rssUrl) {
      await Clipboard.setStringAsync(rssUrl);
      toast({
        message: "RSS feed URL copied to clipboard",
        showProgress: false,
      });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0 bg-black/50"
          onPress={onClose}
        />
        <View className="max-h-[85%] rounded-t-3xl bg-card">
          <KeyboardAwareScrollView
            contentContainerClassName="p-6"
            bottomOffset={20}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View className="mb-4 flex flex-row items-center justify-between">
              <Text className="text-lg font-semibold">Share List</Text>
              <Pressable onPress={onClose} className="p-2">
                <X size={24} color={iconColor} />
              </Pressable>
            </View>

            {/* Public List Section */}
            <View className="mb-6">
              <View className="mb-3 flex flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-sm font-semibold">Public List</Text>
                  <Text className="text-xs text-gray-600 dark:text-gray-400">
                    Make this list publicly accessible
                  </Text>
                </View>
                <Switch
                  value={list.public}
                  onValueChange={(checked) => {
                    editList({
                      listId: list.id,
                      public: checked,
                    });
                  }}
                  disabled={isEditingList}
                />
              </View>

              {list.public && (
                <View className="mt-2 gap-2">
                  <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Share Link
                  </Text>
                  <View className="flex flex-row gap-2">
                    <Input
                      value={publicListUrl}
                      editable={false}
                      inputClasses="flex-1 bg-background text-sm"
                      containerClassName="flex-1"
                    />
                    <Button
                      variant="secondary"
                      onPress={handleCopyPublicUrl}
                      androidRootClassName="h-auto"
                    >
                      <Copy size={16} color={iconColor} />
                    </Button>
                  </View>
                </View>
              )}
            </View>

            <Divider orientation="horizontal" />

            {/* RSS Feed Section */}
            <View className="mt-6">
              <View className="mb-3 flex flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-sm font-semibold">RSS Feed</Text>
                  <Text className="text-xs text-gray-600 dark:text-gray-400">
                    Generate an RSS feed for this list
                  </Text>
                </View>
                <Switch
                  value={!!rssUrl}
                  onValueChange={(checked) => {
                    if (checked) {
                      regenRssToken({ listId: list.id });
                    } else {
                      clearRssToken({ listId: list.id });
                    }
                  }}
                  disabled={isTokenLoading || isClearPending || isRegenPending}
                />
              </View>

              {rssUrl && (
                <View className="mt-2 gap-2">
                  <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Feed URL
                  </Text>
                  <View className="flex flex-row gap-2">
                    <Input
                      value={rssUrl}
                      editable={false}
                      inputClasses="flex-1 bg-background text-sm"
                      containerClassName="flex-1"
                    />
                    <Button
                      variant="secondary"
                      onPress={handleCopyRssUrl}
                      androidRootClassName="h-auto"
                    >
                      <Copy size={16} color={iconColor} />
                    </Button>
                    <Button
                      variant="secondary"
                      onPress={() => regenRssToken({ listId: list.id })}
                      disabled={isRegenPending}
                      androidRootClassName="h-auto"
                    >
                      {isRegenPending ? (
                        <ActivityIndicator size="small" />
                      ) : (
                        <RotateCcw size={16} color={iconColor} />
                      )}
                    </Button>
                  </View>
                </View>
              )}
            </View>

            {/* Close Button */}
            <View className="mt-6 border-t border-border pt-4">
              <Button variant="secondary" onPress={onClose}>
                <Text>Close</Text>
              </Button>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}
