import { useMemo, useState } from "react";
import { ScrollView } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import {
  ListPicker,
  listPathToPickerOption,
} from "@/components/lists/list-picker";
import QueryPageState from "@/components/QueryPageState";
import { useTranslation } from "@/lib/i18n/hooks";
import { NO_PARENT_VALUE } from "@/lib/list-parent-selection";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";

function stringParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default function SelectListParentPage() {
  const params = useLocalSearchParams<{
    returnTo?: string | string[];
    listId?: string | string[];
    selectedParentId?: string | string[];
    hideSubtreeOf?: string | string[];
  }>();
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const { data, error, refetch } = useBookmarkLists();
  const returnTo = stringParam(params.returnTo);
  const listId = stringParam(params.listId);
  const hideSubtreeOf = stringParam(params.hideSubtreeOf);
  const selectedParentId = stringParam(params.selectedParentId);
  const selectedId =
    selectedParentId === NO_PARENT_VALUE ? null : selectedParentId;

  const parentOptions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return (data?.allPaths ?? [])
      .filter((path) => {
        const list = path[path.length - 1];
        return (
          list.userRole !== "viewer" &&
          (!hideSubtreeOf || !path.some((item) => item.id === hideSubtreeOf))
        );
      })
      .map(listPathToPickerOption)
      .filter(
        (option) =>
          !normalizedSearch ||
          option.label.toLowerCase().includes(normalizedSearch),
      );
  }, [data?.allPaths, hideSubtreeOf, search]);

  const selectParent = (parentId: string | null) => {
    const selectedParentId = parentId ?? NO_PARENT_VALUE;

    if (returnTo === "edit" && listId) {
      router.dismissTo({
        pathname: "/dashboard/lists/[slug]/edit",
        params: { slug: listId, selectedParentId },
      });
      return;
    }

    router.dismissTo({
      pathname: "/dashboard/lists/new",
      params: { selectedParentId },
    });
  };

  if (!data) {
    return <QueryPageState error={error} onRetry={() => refetch()} />;
  }

  const options = [
    ...(search
      ? []
      : [
          {
            id: NO_PARENT_VALUE,
            label: t("lists.no_parent"),
            state: selectedId === null ? ("selected" as const) : undefined,
          },
        ]),
    ...parentOptions.map((option) => ({
      ...option,
      state: option.id === selectedId ? ("selected" as const) : undefined,
    })),
  ];

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: t("headers.parent_list"),
          headerSearchBarOptions: {
            placeholder: t("lists.search_lists"),
            autoCapitalize: "none",
            hideWhenScrolling: false,
            onChangeText: (event) => setSearch(event.nativeEvent.text),
          },
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        className="flex-1 bg-background"
      >
        <ListPicker
          options={options}
          onSelect={(id) => selectParent(id === NO_PARENT_VALUE ? null : id)}
          emptyMessage={t("lists.no_lists_found")}
        />
      </ScrollView>
    </>
  );
}
