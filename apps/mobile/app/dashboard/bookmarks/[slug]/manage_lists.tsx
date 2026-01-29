import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import Checkbox from "expo-checkbox";
import { useLocalSearchParams } from "expo-router";
import ChevronRight from "@/components/ui/ChevronRight";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useColorScheme } from "@/lib/useColorScheme";
import { condProps } from "@/lib/utils";

import {
  useAddBookmarkToList,
  useBookmarkLists,
  useRemoveBookmarkFromList,
} from "@karakeep/shared-react/hooks/lists";
import { api } from "@karakeep/shared-react/trpc";
import { ZBookmarkListTreeNode } from "@karakeep/shared/utils/listUtils";

interface ListItem {
  id: string;
  icon: string;
  name: string;
  level: number;
  parent?: string;
  numChildren: number;
  collapsed: boolean;
  userRole: string;
  type: "manual" | "smart";
}

// Helper function to build parent map
function buildParentMap(
  node: ZBookmarkListTreeNode,
  parentMap: Record<string, string>,
  parent?: string,
) {
  if (parent) {
    parentMap[node.item.id] = parent;
  }
  if (node.children) {
    node.children.forEach((child) =>
      buildParentMap(child, parentMap, node.item.id),
    );
  }
}

// Helper function to get all ancestors of a list
function getAncestors(
  listId: string,
  parentMap: Record<string, string>,
): string[] {
  const ancestors: string[] = [];
  let current = listId;
  while (parentMap[current]) {
    ancestors.push(parentMap[current]);
    current = parentMap[current];
  }
  return ancestors;
}

function traverseTree(
  node: ZBookmarkListTreeNode,
  lists: ListItem[],
  showChildrenOf: Record<string, boolean>,
  parent?: string,
  level = 0,
) {
  lists.push({
    id: node.item.id,
    icon: node.item.icon,
    name: node.item.name,
    level,
    parent,
    numChildren: node.children?.length ?? 0,
    collapsed: !showChildrenOf[node.item.id],
    userRole: node.item.userRole,
    type: node.item.type,
  });

  if (node.children && showChildrenOf[node.item.id]) {
    node.children.forEach((child) =>
      traverseTree(child, lists, showChildrenOf, node.item.id, level + 1),
    );
  }
}

const ListPickerPage = () => {
  const { slug: bookmarkId } = useLocalSearchParams();
  if (typeof bookmarkId !== "string") {
    throw new Error("Unexpected param type");
  }
  const { colors } = useColorScheme();
  const [showChildrenOf, setShowChildrenOf] = useState<Record<string, boolean>>(
    {},
  );
  const hasInitializedExpansion = useRef(false);
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

  // Automatically expand parent lists of selected items (only once on mount)
  useEffect(() => {
    if (!existingLists || !data?.root || hasInitializedExpansion.current) {
      return;
    }

    // Build a map of list ID to parent ID
    const parentMap: Record<string, string> = {};
    Object.values(data.root).forEach((list) => {
      buildParentMap(list, parentMap);
    });

    // Find all ancestors of selected lists
    const parentsToExpand: Record<string, boolean> = {};
    existingLists.forEach((listId) => {
      const ancestors = getAncestors(listId, parentMap);
      ancestors.forEach((ancestorId) => {
        parentsToExpand[ancestorId] = true;
      });
    });

    // Set initial expansion state
    if (Object.keys(parentsToExpand).length > 0) {
      setShowChildrenOf(parentsToExpand);
      hasInitializedExpansion.current = true;
    }
  }, [existingLists, data?.root]);

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

  // Build the nested list structure
  const lists: ListItem[] = [];
  if (data?.root) {
    Object.values(data.root).forEach((list) => {
      traverseTree(list, lists, showChildrenOf);
    });
  }

  // Filter out lists where user is a viewer (can't add/remove bookmarks)
  const filteredLists = lists.filter((list) => list.userRole !== "viewer");

  return (
    <CustomSafeAreaView>
      <FlatList
        className="h-full"
        contentContainerStyle={{
          gap: 5,
        }}
        renderItem={(l) => {
          const listId = l.item.id;
          const isLoading = isListLoading(listId);
          const isChecked = existingLists && existingLists.has(listId);
          const isSmartList = l.item.type === "smart";

          return (
            <View
              className="mx-2 flex flex-row items-center rounded-xl border border-input bg-card px-4 py-2"
              style={condProps({
                condition: l.item.level > 0,
                props: { marginLeft: l.item.level * 20 },
              })}
            >
              {l.item.numChildren > 0 && (
                <Pressable
                  className="pr-2"
                  onPress={() => {
                    setShowChildrenOf((prev) => ({
                      ...prev,
                      [l.item.id]: !prev[l.item.id],
                    }));
                  }}
                >
                  <ChevronRight
                    color={colors.foreground}
                    style={{
                      transform: [
                        { rotate: l.item.collapsed ? "0deg" : "90deg" },
                      ],
                    }}
                  />
                </Pressable>
              )}

              <View className="flex flex-1 flex-row items-center justify-between">
                <Text>
                  {l.item.icon} {l.item.name}
                </Text>
                {isLoading ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Pressable
                    disabled={isLoading || isSmartList}
                    onPress={() =>
                      !isLoading && !isSmartList && toggleList(listId)
                    }
                  >
                    <Checkbox
                      value={isChecked}
                      onValueChange={() => {
                        if (!isSmartList) {
                          toggleList(listId);
                        }
                      }}
                      disabled={isLoading || isSmartList}
                    />
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
        data={filteredLists}
      />
    </CustomSafeAreaView>
  );
};

export default ListPickerPage;
