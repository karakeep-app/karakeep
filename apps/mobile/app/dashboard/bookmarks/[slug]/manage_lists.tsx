import { Pressable, ScrollView } from "react-native";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import {
  ListPicker,
  listPathToPickerOption,
} from "@/components/lists/list-picker";
import QueryPageState from "@/components/QueryPageState";
import { useToast } from "@/components/ui/Toast";
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

function byListPathName(a: ZBookmarkList[], b: ZBookmarkList[]) {
  const commonPathLength = Math.min(a.length, b.length);

  for (let index = 0; index < commonPathLength; index++) {
    const comparison = a[index].name.localeCompare(b[index].name);
    if (comparison !== 0) return comparison;
  }

  return a.length - b.length;
}

const ListPickerPage = () => {
  const headerHeight = useHeaderHeight();
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
          headerTitle: "Manage Lists",
          headerRight: () => (
            <Link href="/dashboard/lists/new" asChild>
              <Pressable
                accessibilityLabel="Create list"
                accessibilityRole="button"
                hitSlop={8}
                className="px-2"
              >
                <Plus size={22} color={colors.primary} strokeWidth={2.5} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 40 + headerHeight,
        }}
        className="flex-1 bg-background"
      >
        <ListPicker
          options={options}
          onSelect={toggleList}
          emptyMessage="No lists available"
        />
      </ScrollView>
    </>
  );
};

export default ListPickerPage;
