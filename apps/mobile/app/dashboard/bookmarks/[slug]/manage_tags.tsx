import React, { useMemo } from "react";
import { Pressable, SectionList, TouchableOpacity, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useColorScheme } from "@/lib/useColorScheme";
import { Check, Plus } from "lucide-react-native";

import {
  useAutoRefreshingBookmarkQuery,
  useUpdateBookmarkTags,
} from "@karakeep/shared-react/hooks/bookmarks";
import { api } from "@karakeep/shared-react/trpc";

const NEW_TAG_ID = "new-tag";

const ListPickerPage = () => {
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

  const { data: allTags, isPending: isAllTagsPending } = api.tags.list.useQuery(
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
          { id: t.tagId!, name: t.tagName!, lowered: t.tagName!.toLowerCase() },
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

  const filteredTags = useMemo(() => {
    const loweredSearch = search.toLowerCase();
    let filteredAllTags = allTags?.filter(
      (t) =>
        t.lowered.startsWith(loweredSearch) &&
        !optimisticExistingTagIds.has(t.id),
    );
    let addCreateTag = false;
    if (allTags && search) {
      const exactMatchExists =
        allTags.some((t) => t.lowered == loweredSearch) ||
        optimisticTags.some((t) => t.lowered == loweredSearch);
      addCreateTag = !exactMatchExists;
    }
    if (filteredAllTags && addCreateTag) {
      filteredAllTags = [
        {
          id: NEW_TAG_ID,
          name: search,
          lowered: loweredSearch,
        },
        ...filteredAllTags,
      ];
    }

    const filteredOptimisticTags = optimisticTags.filter((t) =>
      t.lowered.startsWith(loweredSearch),
    );

    return { filteredAllTags, filteredOptimisticTags };
  }, [search, allTags, optimisticTags, optimisticExistingTagIds]);

  const ClearButton = () => (
    <TouchableOpacity
      onPress={clearAllTags}
      disabled={optimisticTags.length === 0}
      className={`mr-4 ${optimisticTags.length === 0 ? "opacity-50" : ""}`}
    >
      <Text className="text-base font-medium text-blue-500">Clear</Text>
    </TouchableOpacity>
  );

  if (isAllTagsPending) {
    return <FullPageSpinner />;
  }

  return (
    <CustomSafeAreaView>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: "Search Tags",
            onChangeText: (event) => setSearch(event.nativeEvent.text),
            autoCapitalize: "none",
            hideWhenScrolling: false,
          },
          headerRight: () => <ClearButton />,
        }}
      />
      <SectionList
        className="h-full px-3"
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        keyExtractor={(t) => t.id}
        contentContainerStyle={{
          gap: 5,
        }}
        SectionSeparatorComponent={() => <View className="h-1" />}
        sections={[
          {
            title: "Existing Tags",
            data: filteredTags.filteredOptimisticTags ?? [],
          },
          {
            title: "All Tags",
            data: filteredTags.filteredAllTags ?? [],
          },
        ]}
        renderItem={(t) => (
          <Pressable
            key={t.item.id}
            onPress={() =>
              updateTags({
                bookmarkId,
                detach:
                  t.section.title == "Existing Tags"
                    ? [
                        {
                          tagId:
                            t.item.id == NEW_TAG_ID ? undefined : t.item.id,
                          tagName: t.item.name,
                        },
                      ]
                    : [],
                attach:
                  t.section.title == "All Tags"
                    ? [
                        {
                          tagId:
                            t.item.id == NEW_TAG_ID ? undefined : t.item.id,
                          tagName: t.item.name,
                        },
                      ]
                    : [],
              })
            }
          >
            <View className="mx-2 flex flex-row items-center gap-2 rounded-xl border border-input bg-card px-4 py-2">
              {t.section.title == "Existing Tags" && (
                <Check color={colors.foreground} />
              )}
              {t.section.title == "All Tags" && t.item.id == NEW_TAG_ID && (
                <Plus color={colors.foreground} />
              )}
              <Text>
                {t.item.id == NEW_TAG_ID
                  ? `Create new tag '${t.item.name}'`
                  : t.item.name}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </CustomSafeAreaView>
  );
};

export default ListPickerPage;
