import React, { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { useTagAutocomplete } from "@karakeep/shared-react/hooks/tags";
import { GroupedSection, RowSeparator } from "@/components/ui/GroupedList";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useColorScheme } from "@/lib/useColorScheme";
import { Check, Plus } from "lucide-react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";

import {
  useAutoRefreshingBookmarkQuery,
  useUpdateBookmarkTags,
} from "@karakeep/shared-react/hooks/bookmarks";

const NEW_TAG_ID = "new-tag";

const TagPickerPage = () => {
  const headerHeight = useHeaderHeight();
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

  const searchQueryDebounced = useDebounce(search, 200);

  const { data: allTags, isLoading: isAllTagsPending } = useTagAutocomplete({
    nameContains: searchQueryDebounced,
    select: (data) =>
      data.tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        lowered: tag.name.toLowerCase(),
      })),
  });

  const { data: bookmark } = useAutoRefreshingBookmarkQuery({
    bookmarkId,
  });
  const existingTags = bookmark?.tags;

  const [optimisticTags, setOptimisticTags] = React.useState<
    { id: string; name: string; lowered: string }[]
  >([]);

  const filteredAllTags = useMemo(() => {
    if (allTags === undefined) {
      return [];
    }

    const loweredSearch = search.toLowerCase();
    const filteredTags = allTags.filter(
      (t) => !optimisticTags.find((o) => o.id === t.id),
    );

    if (search) {
      const exactMatchExists =
        allTags.some((t) => t.lowered === loweredSearch) ||
        optimisticTags.some((t) => t.lowered === loweredSearch);

      if (!exactMatchExists) {
        return [
          { id: NEW_TAG_ID, name: search, lowered: loweredSearch },
          ...filteredTags,
        ];
      }
    }

    return filteredTags;
  }, [allTags, optimisticTags, search]);

  React.useEffect(() => {
    if (!existingTags) {
      return;
    }
    const bookmarkTags = existingTags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      lowered: tag.name.toLowerCase(),
    }));

    setOptimisticTags((prev) => {
      const prevOrder = new Map<string, number>();
      prev.forEach((tag, index) => {
        prevOrder.set(tag.id, index);
        prevOrder.set(tag.lowered, index);
      });

      return bookmarkTags
        .map((tag, index) => ({ tag, index }))
        .sort((a, b) => {
          const aOrder =
            prevOrder.get(a.tag.id) ??
            prevOrder.get(a.tag.lowered) ??
            Number.MAX_SAFE_INTEGER + a.index;
          const bOrder =
            prevOrder.get(b.tag.id) ??
            prevOrder.get(b.tag.lowered) ??
            Number.MAX_SAFE_INTEGER + b.index;

          return aOrder - bOrder;
        })
        .map(({ tag }) => tag);
    });
  }, [existingTags]);

  const { mutate: updateTags } = useUpdateBookmarkTags({
    onMutate: (req) => {
      req.attach.forEach((t) =>
        setOptimisticTags((prev) => [
          ...prev,
          {
            id: t.tagId ?? `${NEW_TAG_ID}:${t.tagName}`,
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
              className={`px-2 ${optimisticTags.length === 0 ? "opacity-50" : ""}`}
            >
              <Text className="text-primary">Clear</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          gap: 20,
          paddingBottom: 40 + headerHeight,
        }}
        className="flex-1 bg-background"
      >
        {optimisticTags.length > 0 && (
          <GroupedSection header="Attached">
            {optimisticTags.map((tag, index) => (
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
        {optimisticTags.length === 0 && filteredAllTags.length === 0 && (
          <View className="items-center py-12">
            <Text color="tertiary">No tags found</Text>
          </View>
        )}
      </ScrollView>
    </>
  );
};

export default TagPickerPage;
