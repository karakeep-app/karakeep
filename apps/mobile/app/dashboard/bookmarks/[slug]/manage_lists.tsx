import { useRef, useState } from "react";
import { Pressable, ScrollView } from "react-native";
import { Link, router, Stack, useLocalSearchParams } from "expo-router";
import {
  byListPathName,
  ListPicker,
  listPathToPickerOption,
} from "@/components/lists/list-picker";
import QueryPageState from "@/components/QueryPageState";
import { HeaderTextButton } from "@/components/ui/SheetHeader";
import { useToast } from "@/components/ui/Toast";
import { useCommonStrings, useTranslation } from "@/lib/i18n/hooks";
import { useColorScheme } from "@/lib/useColorScheme";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react-native";
import { useHeaderHeight } from "expo-router/react-navigation";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import {
  useAddBookmarkToList,
  useBookmarkLists,
  useRemoveBookmarkFromList,
} from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";

const ListPickerPage = () => {
  const headerHeight = useHeaderHeight();
  const api = useTRPC();
  const { slug: bookmarkId } = useLocalSearchParams();
  const { colors } = useColorScheme();
  const { t } = useTranslation();
  const strings = useCommonStrings();

  if (typeof bookmarkId !== "string") {
    throw new Error("Unexpected param type");
  }

  const { toast } = useToast();
  const onError = () => {
    toast({
      message: strings.somethingWentWrong,
      variant: "destructive",
      showProgress: false,
    });
  };

  const {
    data: existingLists,
    error: existingListsError,
    refetch: refetchExistingLists,
  } = useQuery(
    api.lists.getListsOfBookmark.queryOptions(
      { bookmarkId },
      {
        select: (data: { lists: ZBookmarkList[] }) =>
          new Set(data.lists.map((l) => l.id)),
      },
    ),
  );

  const { data, error: listsError, refetch: refetchLists } = useBookmarkLists();

  const {
    mutate: addToList,
    isPending: isAddingToList,
    variables: addVariables,
  } = useAddBookmarkToList({
    onError,
  });

  const {
    mutate: removeToList,
    isPending: isRemovingFromList,
    variables: removeVariables,
  } = useRemoveBookmarkFromList({
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

  const [search, setSearch] = useState("");
  const { allPaths } = data ?? {};
  const filteredPaths = allPaths
    ?.filter((path) => path[path.length - 1].userRole !== "viewer")
    .filter((path) => path[path.length - 1].type !== "smart")
    .sort(byListPathName);
  const options =
    filteredPaths?.map((path) => {
      const option = listPathToPickerOption(path);

      return {
        ...option,
        state: isListLoading(option.id)
          ? ("loading" as const)
          : existingLists?.has(option.id)
            ? ("selected" as const)
            : undefined,
      };
    }) ?? [];

  const needle = search.trim().toLowerCase();
  const matchingOptions = needle
    ? options.filter((option) => option.label.toLowerCase().includes(needle))
    : options;
  // Lists it's already in come first, in the order they had when the sheet
  // opened: rows that jump on tap would move out from under your finger.
  const openingAttached = useRef<Set<string> | null>(null);
  if (existingLists && !openingAttached.current) {
    openingAttached.current = new Set(existingLists);
  }
  const orderedOptions = [
    ...matchingOptions.filter((o) => openingAttached.current?.has(o.id)),
    ...matchingOptions.filter((o) => !openingAttached.current?.has(o.id)),
  ];

  if (!existingLists || !data) {
    return (
      <QueryPageState
        error={existingListsError ?? listsError}
        onRetry={() => {
          void refetchExistingLists();
          void refetchLists();
        }}
      />
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: false,
          headerTitle: t("headers.manage_lists"),
          headerSearchBarOptions: {
            placeholder: t("lists.search_lists_placeholder"),
            onChangeText: (event) => setSearch(event.nativeEvent.text),
            autoCapitalize: "none",
            hideWhenScrolling: false,
          },
          headerLeft: () => (
            <Link href="/dashboard/lists/new" asChild>
              <Pressable
                accessibilityLabel={t("lists_tab.new_list")}
                accessibilityRole="button"
                hitSlop={8}
                className="px-2"
              >
                <Plus size={22} color={colors.primary} strokeWidth={2.5} />
              </Pressable>
            </Link>
          ),
          headerRight: () => (
            <HeaderTextButton
              label={t("actions.done")}
              emphasized
              onPress={() => router.back()}
            />
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          padding: 16,
          gap: 20,
          paddingBottom: 40 + headerHeight,
        }}
        className="flex-1"
      >
        <ListPicker
          options={orderedOptions}
          onSelect={toggleList}
          emptyMessage={
            needle ? t("manage_lists.no_matching") : t("manage_lists.no_lists")
          }
        />
      </ScrollView>
    </>
  );
};

export default ListPickerPage;
