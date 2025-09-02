import React from "react";
import { FlatList, Pressable, View } from "react-native";
import Checkbox from "expo-checkbox";
import { useLocalSearchParams } from "expo-router";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";

import {
  useAddBookmarkToList,
  useBookmarkLists,
  useRemoveBookmarkFromList,
} from "@karakeep/shared-react/hooks/lists";
import { api } from "@karakeep/shared-react/trpc";

const ListPickerPage = () => {
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
  const { data: existingLists } = api.lists.getListsOfBookmark.useQuery(
    {
      bookmarkId,
    },
    {
      select: (data) => new Set(data.lists.map((l) => l.id)),
    },
  );
  const { data } = useBookmarkLists();

  const { mutate: addToList } = useAddBookmarkToList({
    onSuccess: () => {
      toast({
        message: `The bookmark has been added to the list!`,
        showProgress: false,
      });
    },
    onError,
  });

  const { mutate: removeToList } = useRemoveBookmarkFromList({
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

  const { allPaths } = data ?? {};
  return (
    <CustomSafeAreaView>
      <FlatList
        className="h-full"
        contentContainerStyle={{
          gap: 5,
        }}
        renderItem={(l) => (
          <View className="mx-2 flex flex-row items-center rounded-xl border border-input bg-card px-4 py-2">
            <Pressable
              key={l.item[l.item.length - 1].id}
              onPress={() => toggleList(l.item[l.item.length - 1].id)}
              className="flex w-full flex-row justify-between"
            >
              <Text>
                {l.item.map((item) => `${item.icon} ${item.name}`).join(" / ")}
              </Text>
              <Checkbox
                value={
                  existingLists &&
                  existingLists.has(l.item[l.item.length - 1].id)
                }
                onValueChange={() => {
                  toggleList(l.item[l.item.length - 1].id);
                }}
              />
            </Pressable>
          </View>
        )}
        data={allPaths}
      />
    </CustomSafeAreaView>
  );
};

export default ListPickerPage;
