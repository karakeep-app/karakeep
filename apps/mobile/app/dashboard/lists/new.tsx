import React, { useState } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { router, useLocalSearchParams } from "expo-router";
import {
  getSmartQueryErrorMessage,
  isSmartQueryIncomplete,
  ListFormFields,
} from "@/components/lists/ListFormFields";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SheetHeader } from "@/components/ui/SheetHeader";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useCommonStrings, useTranslation } from "@/lib/i18n/hooks";
import { NO_PARENT_VALUE } from "@/lib/list-parent-selection";

import {
  useBookmarkLists,
  useCreateBookmarkList,
} from "@karakeep/shared-react/hooks/lists";

type ListType = "manual" | "smart";

const NewListPage = () => {
  const { selectedParentId } = useLocalSearchParams<{
    selectedParentId?: string | string[];
  }>();
  const dismiss = () => {
    router.back();
  };
  const { toast } = useToast();
  const { t } = useTranslation();
  const strings = useCommonStrings();
  const listTypeOptions: { label: string; value: ListType }[] = [
    { label: t("lists.type_manual"), value: "manual" },
    { label: t("lists.type_smart"), value: "smart" },
  ];
  const [text, setText] = useState("");
  const [icon, setIcon] = useState("📁");
  const [listType, setListType] = useState<ListType>("manual");
  const [query, setQuery] = useState("");
  const [queryError, setQueryError] = useState<string | undefined>();
  const [parentId, setParentId] = useState<string | null>(null);

  React.useEffect(() => {
    if (typeof selectedParentId !== "string") return;
    setParentId(selectedParentId === NO_PARENT_VALUE ? null : selectedParentId);
    router.setParams({ selectedParentId: undefined });
  }, [selectedParentId]);

  const { data: lists } = useBookmarkLists();
  const { mutate, isPending } = useCreateBookmarkList({
    onSuccess: () => {
      const parentName = parentId
        ? lists?.getPathById(parentId)?.at(-1)?.name
        : undefined;
      toast({
        message: parentName
          ? t("lists.saved_in", { name: parentName })
          : t("lists.created"),
        variant: "success",
        showProgress: false,
      });
      dismiss();
    },
    onError: (error) => {
      let errorMessage = strings.somethingWentWrong;
      if (error.data?.zodError) {
        errorMessage = Object.values(error.data.zodError.fieldErrors)
          .flat()
          .join("\n");
      } else if (error.message) {
        errorMessage = error.message;
      }
      if (listType === "smart") {
        setQueryError(getSmartQueryErrorMessage(errorMessage, query));
      } else {
        toast({ message: errorMessage, variant: "destructive" });
      }
    },
  });

  const name = text.trim();
  const canSave =
    name.length > 0 &&
    (listType !== "smart" ||
      (query.trim().length > 0 && !isSmartQueryIncomplete(query)));

  const onSubmit = () => {
    setQueryError(undefined);
    mutate({
      name,
      icon,
      type: listType,
      query: listType === "smart" ? query.trim() : undefined,
      parentId,
    });
  };

  return (
    <KeyboardAwareScrollView
      bottomOffset={160}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-4 px-4 pt-2 pb-8"
    >
      <SheetHeader
        onSave={onSubmit}
        saveDisabled={!canSave}
        isDirty={name.length > 0 || query.trim().length > 0}
        isSaving={isPending}
      />
      <SegmentedControl
        options={listTypeOptions}
        value={listType}
        onChange={setListType}
      />
      <Text variant="footnote" color="tertiary" className="-mt-2 px-4">
        {listType === "manual"
          ? t("lists.type_manual_description")
          : t("lists.type_smart_description")}
      </Text>

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
              returnTo: "new",
              selectedParentId: parentId ?? NO_PARENT_VALUE,
            },
          })
        }
        isSmart={listType === "smart"}
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          setQueryError(undefined);
        }}
        queryError={queryError}
        autoFocus
      />
    </KeyboardAwareScrollView>
  );
};

export default NewListPage;
