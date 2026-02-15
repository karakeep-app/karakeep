import React from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { RowSeparator } from "@/components/ui/GroupedList";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useColorScheme } from "@/lib/useColorScheme";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react-native";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import {
  useAddBookmarkToList,
  useBookmarkLists,
  useRemoveBookmarkFromList,
} from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";

const ListPickerPage = () => {
  const api = useTRPC();
  const { slug: bookmarkId } = useLocalSearchParams();
  const { colors } = useColorScheme();

  if (typeof bookmarkId !== "string") {
    throw new Error("Unexpected param type");
  }

  const { toast } = useToast();
  const onError = () => {
    toast({
      message: "Something went wrong",
      variant: "destructive",
      showProgress: false,
    });
  };

  const { data: existingLists } = useQuery(
    api.lists.getListsOfBookmark.queryOptions(
      { bookmarkId },
      {
        select: (data: { lists: ZBookmarkList[] }) =>
          new Set(data.lists.map((l) => l.id)),
      },
    ),
  );

  const { data } = useBookmarkLists();

  const {
    mutate: addToList,
    isPending: isAddingToList,
    variables: addVariables,
  } = useAddBookmarkToList({
    onSuccess: () => {
      toast({
        message: "Added to list!",
        showProgress: false,
      });
    },
    onError,
  });

  const {
    mutate: removeToList,
    isPending: isRemovingFromList,
    variables: removeVariables,
  } = useRemoveBookmarkFromList({
    onSuccess: () => {
      toast({
        message: "Removed from list!",
        showProgress: false,
      });
    },
    onError,
  });

  const toggleList = (listId: string) => {
    if (!existingLists) return;
    if (existingLists.has(listId)) {
      removeToList({ bookmarkId, listId });
    } else {
      addToList({ bookmarkId, listId });
    }
  };

  const isListLoading = (listId: string) => {
    return (
      (isAddingToList && addVariables?.listId === listId) ||
      (isRemovingFromList && removeVariables?.listId === listId)
    );
  };

  const { allPaths } = data ?? {};
  const filteredPaths = allPaths?.filter(
    (path) => path[path.length - 1].userRole !== "viewer",
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: false,
          headerTitle: "Manage Lists",
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        className="bg-background"
      >
        {filteredPaths && filteredPaths.length > 0 ? (
          <View
            className="overflow-hidden rounded-xl bg-card"
            style={{ borderCurve: "continuous" }}
          >
            {filteredPaths.map((path, index) => {
              const listId = path[path.length - 1].id;
              const isLoading = isListLoading(listId);
              const isChecked = existingLists?.has(listId);

              return (
                <React.Fragment key={listId}>
                  {index > 0 && <RowSeparator />}
                  <Pressable
                    onPress={() => !isLoading && toggleList(listId)}
                    disabled={isLoading}
                    className="flex-row items-center justify-between px-4 py-3 active:opacity-70"
                  >
                    <Text className="flex-1 pr-3" numberOfLines={1}>
                      {path
                        .map((item) => `${item.icon} ${item.name}`)
                        .join(" / ")}
                    </Text>
                    {isLoading ? (
                      <ActivityIndicator size="small" />
                    ) : isChecked ? (
                      <Check
                        size={20}
                        color={colors.primary}
                        strokeWidth={2.5}
                      />
                    ) : null}
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>
        ) : (
          <View className="items-center py-12">
            <Text color="tertiary">No lists available</Text>
          </View>
        )}
      </ScrollView>
    </>
  );
};

export default ListPickerPage;
