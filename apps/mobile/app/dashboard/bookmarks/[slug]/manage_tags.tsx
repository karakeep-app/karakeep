import React, { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { GroupedSection, RowSeparator } from "@/components/ui/GroupedList";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useColorScheme } from "@/lib/useColorScheme";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react-native";

import {
  useAutoRefreshingBookmarkQuery,
  useUpdateBookmarkTags,
} from "@karakeep/shared-react/hooks/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";

const NEW_TAG_ID = "new-tag";

const TagPickerPage = () => {
  const api = useTRPC();
  const { colors } = useColorScheme();
  const { slug: bookmarkId } = useLocalSearchParams();
  const [search, setSearch] = React.useState("");

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

  const { data: allTags, isPending: isAllTagsPending } = useQuery(
    api.tags.list.queryOptions(
      {},
      {
        select: React.useCallback(
          (data: { tags: { id: string; name: string }[] }) => {
            return data.tags
              .map((t) => ({
                id: t.id,
                name: t.name,
                lowered: t.name.toLowerCase(),
              }))
              .sort((a, b) => a.lowered.localeCompare(b.lowered));
          },
          [],
        ),
      },
    ),
  );

  const { data: existingTags } = useAutoRefreshingBookmarkQuery({
    bookmarkId,
  });

  const [optimisticTags, setOptimisticTags] = React.useState<
    { id: string; name: string; lowered: string }[]
  >([]);

  React.useEffect(() => {
    setOptimisticTags(
      existingTags?.tags.map((t) => ({
        id: t.id,
        name: t.name,
        lowered: t.name.toLowerCase(),
      })) ?? [],
    );
  }, [existingTags]);

  const { mutate: updateTags } = useUpdateBookmarkTags({
    onMutate: (req) => {
      req.attach.forEach((t) =>
        setOptimisticTags((prev) => [
          ...prev,
          {
            id: t.tagId!,
            name: t.tagName!,
            lowered: t.tagName!.toLowerCase(),
          },
        ]),
      );
      req.detach.forEach((t) =>
        setOptimisticTags((prev) => prev.filter((p) => p.id != t.tagId!)),
      );
    },
    onError,
  });

  const clearAllTags = () => {
    if (optimisticTags.length === 0) return;
    updateTags({
      bookmarkId,
      detach: optimisticTags.map((tag) => ({
        tagId: tag.id,
        tagName: tag.name,
      })),
      attach: [],
    });
  };

  const optimisticExistingTagIds = useMemo(() => {
    return new Set(optimisticTags?.map((t) => t.id) ?? []);
  }, [optimisticTags]);

  const { filteredAllTags, filteredOptimisticTags } = useMemo(() => {
    const loweredSearch = search.toLowerCase();
    let filteredAll =
      allTags?.filter(
        (t) =>
          t.lowered.startsWith(loweredSearch) &&
          !optimisticExistingTagIds.has(t.id),
      ) ?? [];

    if (allTags && search) {
      const exactMatchExists =
        allTags.some((t) => t.lowered == loweredSearch) ||
        optimisticTags.some((t) => t.lowered == loweredSearch);
      if (!exactMatchExists) {
        filteredAll = [
          { id: NEW_TAG_ID, name: search, lowered: loweredSearch },
          ...filteredAll,
        ];
      }
    }

    const filteredExisting = optimisticTags.filter((t) =>
      t.lowered.startsWith(loweredSearch),
    );

    return {
      filteredAllTags: filteredAll,
      filteredOptimisticTags: filteredExisting,
    };
  }, [search, allTags, optimisticTags, optimisticExistingTagIds]);

  const handleTagPress = (
    tag: { id: string; name: string },
    action: "attach" | "detach",
  ) => {
    updateTags({
      bookmarkId,
      attach:
        action === "attach"
          ? [
              {
                tagId: tag.id === NEW_TAG_ID ? undefined : tag.id,
                tagName: tag.name,
              },
            ]
          : [],
      detach:
        action === "detach"
          ? [
              {
                tagId: tag.id === NEW_TAG_ID ? undefined : tag.id,
                tagName: tag.name,
              },
            ]
          : [],
    });
  };

  if (isAllTagsPending) {
    return <FullPageSpinner />;
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: "Search Tags",
            onChangeText: (event) => setSearch(event.nativeEvent.text),
            autoCapitalize: "none",
            hideWhenScrolling: false,
          },
          headerRight: () => (
            <Pressable
              onPress={clearAllTags}
              disabled={optimisticTags.length === 0}
              className={optimisticTags.length === 0 ? "opacity-50" : ""}
            >
              <Text className="text-primary">Clear</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}
        className="bg-background"
      >
        {filteredOptimisticTags.length > 0 && (
          <GroupedSection header="Attached">
            {filteredOptimisticTags.map((tag, index) => (
              <React.Fragment key={tag.id}>
                {index > 0 && <RowSeparator />}
                <Pressable
                  onPress={() => handleTagPress(tag, "detach")}
                  className="flex-row items-center justify-between px-4 py-3 active:opacity-70"
                >
                  <Text className="flex-1 pr-3">{tag.name}</Text>
                  <Check size={20} color={colors.primary} strokeWidth={2.5} />
                </Pressable>
              </React.Fragment>
            ))}
          </GroupedSection>
        )}
        {filteredAllTags.length > 0 && (
          <GroupedSection header="All Tags">
            {filteredAllTags.map((tag, index) => (
              <React.Fragment key={tag.id}>
                {index > 0 && <RowSeparator />}
                <Pressable
                  onPress={() => handleTagPress(tag, "attach")}
                  className="flex-row items-center justify-between px-4 py-3 active:opacity-70"
                >
                  {tag.id === NEW_TAG_ID ? (
                    <>
                      <Text className="flex-1 pr-3 text-primary">
                        Create &ldquo;{tag.name}&rdquo;
                      </Text>
                      <Plus size={20} color={colors.primary} strokeWidth={2} />
                    </>
                  ) : (
                    <Text className="flex-1 pr-3">{tag.name}</Text>
                  )}
                </Pressable>
              </React.Fragment>
            ))}
          </GroupedSection>
        )}
        {filteredOptimisticTags.length === 0 &&
          filteredAllTags.length === 0 && (
            <View className="items-center py-12">
              <Text color="tertiary">No tags found</Text>
            </View>
          )}
      </ScrollView>
    </>
  );
};

export default TagPickerPage;
