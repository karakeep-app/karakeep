import React from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import Checkbox from "expo-checkbox";
import { useLocalSearchParams } from "expo-router";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useQuery } from "@tanstack/react-query";

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
      {
        bookmarkId,
      },
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
        message: `The bookmark has been added to the list!`,
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
        message: `The bookmark has been removed from the list!`,
        showProgress: false,
      });
    },
    onError,
  });

  const toggleList = (listId: string) => {
    if (!existingLists) {
      return;
    }
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
  // Filter out lists where user is a viewer (can't add/remove bookmarks)
  const filteredPaths = allPaths?.filter(
    (path) => path[path.length - 1].userRole !== "viewer",
  );
  return (
    <CustomSafeAreaView>
      <FlatList
        className="h-full"
        contentContainerStyle={{
          gap: 6,
        }}
        renderItem={(l) => {
          const listId = l.item[l.item.length - 1].id;
          const isLoading = isListLoading(listId);
          const isChecked = existingLists && existingLists.has(listId);

          return (
            <View className="mx-2 flex flex-row items-center rounded-xl bg-card px-4 py-2">
              <Pressable
                key={listId}
                onPress={() => !isLoading && toggleList(listId)}
                disabled={isLoading}
                className="flex w-full flex-row items-center justify-between"
              >
                <Text className="shrink">
                  {l.item
                    .map((item) => `${item.icon} ${item.name}`)
                    .join(" / ")}
                </Text>
                {isLoading ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Checkbox
                    value={isChecked}
                    onValueChange={() => {
                      toggleList(listId);
                    }}
                    disabled={isLoading}
                  />
                )}
              </Pressable>
            </View>
          );
        }}
        data={filteredPaths}
      />
    </CustomSafeAreaView>
  );
};

export default ListPickerPage;
