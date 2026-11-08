import { useEffect, useState } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { router, useLocalSearchParams } from "expo-router";
import {
  getSmartQueryErrorMessage,
  isSmartQueryIncomplete,
  ListFormFields,
} from "@/components/lists/ListFormFields";
import QueryPageState from "@/components/QueryPageState";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { GroupedSection, NavigationRow } from "@/components/ui/GroupedList";
import { SheetHeader } from "@/components/ui/SheetHeader";
import { useToast } from "@/components/ui/Toast";
import { useCommonStrings, useTranslation } from "@/lib/i18n/hooks";
import { NO_PARENT_VALUE } from "@/lib/list-parent-selection";
import { useQuery } from "@tanstack/react-query";

import { useEditBookmarkList } from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";

const EditListPage = () => {
  const { slug: listId, selectedParentId } = useLocalSearchParams<{
    slug?: string | string[];
    selectedParentId?: string | string[];
  }>();
  const [text, setText] = useState("");
  const [icon, setIcon] = useState("📁");
  const [query, setQuery] = useState("");
  const [queryError, setQueryError] = useState<string | undefined>();
  const [parentId, setParentId] = useState<string | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();
  const strings = useCommonStrings();
  const api = useTRPC();
  const { mutate, isPending: editIsPending } = useEditBookmarkList({
    onSuccess: () => {
      dismiss();
    },
    onError: (error) => {
      // Extract error message from the error object
      let errorMessage = strings.somethingWentWrong;
      if (error.data?.zodError) {
        errorMessage = Object.values(error.data.zodError.fieldErrors)
          .flat()
          .join("\n");
      } else if (error.message) {
        errorMessage = error.message;
      }
      if (list?.type === "smart") {
        setQueryError(getSmartQueryErrorMessage(errorMessage, query));
      } else {
        toast({ message: errorMessage, variant: "destructive" });
      }
    },
  });

  if (typeof listId !== "string") {
    throw new Error("Unexpected param type");
  }

  const {
    data: list,
    error,
    refetch,
  } = useQuery(
    api.lists.get.queryOptions({
      listId,
    }),
  );

  const dismiss = () => {
    router.back();
  };

  useEffect(() => {
    if (!list) return;
    setText(list.name ?? "");
    setIcon(list.icon || "📁");
    setQuery(list.query ?? "");
    setParentId(list.parentId);
  }, [list?.icon, list?.id, list?.parentId, list?.query, list?.name]);

  useEffect(() => {
    if (typeof selectedParentId !== "string") return;
    setParentId(selectedParentId === NO_PARENT_VALUE ? null : selectedParentId);
    router.setParams({ selectedParentId: undefined });
  }, [selectedParentId]);

  const canSave =
    text.trim().length > 0 &&
    (list?.type !== "smart" ||
      (query.trim().length > 0 && !isSmartQueryIncomplete(query)));

  const onSubmit = () => {
    setQueryError(undefined);
    mutate({
      listId,
      name: text.trim(),
      icon,
      parentId,
      query: list?.type === "smart" ? query.trim() : undefined,
    });
  };

  if (!list) {
    return <QueryPageState error={error} onRetry={() => refetch()} />;
  }

  return (
    <>
      <SheetHeader
        onSave={onSubmit}
        saveDisabled={!canSave}
        isDirty={
          !!list &&
          (text !== (list.name ?? "") ||
            icon !== (list.icon || "📁") ||
            query !== (list.query ?? "") ||
            parentId !== list.parentId)
        }
        isSaving={editIsPending}
      />
      {editIsPending ? (
        <FullPageSpinner />
      ) : (
        <KeyboardAwareScrollView
          bottomOffset={160}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-4 px-4 pt-2 pb-8"
        >
          <ListFormFields
            name={text}
            onNameChange={setText}
            icon={icon}
            onIconChange={setIcon}
            parentId={parentId}
            onPressParent={() =>
              router.push({
                pathname: "/dashboard/lists/select-parent",
                params: {
                  returnTo: "edit",
                  listId,
                  selectedParentId: parentId ?? NO_PARENT_VALUE,
                  hideSubtreeOf: listId,
                },
              })
            }
            isSmart={list.type === "smart"}
            query={query}
            onQueryChange={(value) => {
              setQuery(value);
              setQueryError(undefined);
            }}
            queryError={queryError}
          />

          <GroupedSection
            footer={
              list.type === "smart"
                ? t("lists.type_locked_smart")
                : t("lists.type_locked_manual")
            }
          >
            <NavigationRow
              label={t("list_sharing.title")}
              onPress={() => router.push(`/dashboard/lists/${listId}/sharing`)}
            />
          </GroupedSection>
        </KeyboardAwareScrollView>
      )}
    </>
  );
};

export default EditListPage;
