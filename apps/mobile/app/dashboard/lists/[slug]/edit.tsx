import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ListParentField } from "@/components/lists/list-parent-field";
import QueryPageState from "@/components/QueryPageState";
import { Button } from "@/components/ui/Button";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import {
  useCommonActions,
  useCommonStrings,
  useTranslation,
} from "@/lib/i18n/hooks";
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
  const [parentId, setParentId] = useState<string | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();
  const actions = useCommonActions();
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
      toast({
        message: errorMessage,
        variant: "destructive",
      });
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

  const onSubmit = () => {
    if (!text.trim()) {
      toast({ message: t("lists.name_empty"), variant: "destructive" });
      return;
    }

    if (list?.type === "smart" && !query.trim()) {
      toast({
        message: t("lists.smart_needs_query"),
        variant: "destructive",
      });
      return;
    }

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
      {editIsPending ? (
        <FullPageSpinner />
      ) : (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-4 px-4 pb-8"
        >
          {/* List Type Info - not editable */}
          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">
              {t("lists.type_label")}
            </Text>
            <View className="flex flex-row gap-2">
              <View className="flex-1">
                <Button
                  variant={list?.type === "manual" ? "primary" : "secondary"}
                  disabled
                >
                  <Text>{t("lists.type_manual")}</Text>
                </Button>
              </View>
              <View className="flex-1">
                <Button
                  variant={list?.type === "smart" ? "primary" : "secondary"}
                  disabled
                >
                  <Text>{t("lists.type_smart")}</Text>
                </Button>
              </View>
            </View>
          </View>

          <EmojiPicker value={icon} onChange={setIcon} />

          <Input
            className="bg-card"
            label={t("lists.name_label")}
            labelClasses="text-sm text-muted-foreground"
            onChangeText={setText}
            value={text}
            placeholder={t("lists.name_placeholder")}
            autoFocus
            autoCapitalize="sentences"
          />

          <ListParentField
            value={parentId}
            onPress={() =>
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
          />

          {/* Smart List Query Input */}
          {list?.type === "smart" && (
            <View className="gap-2">
              <Text className="text-sm text-muted-foreground">
                {t("lists.search_query_label")}
              </Text>
              <Input
                className="bg-card"
                onChangeText={setQuery}
                value={query}
                placeholder={t("lists.search_query_placeholder")}
                autoCapitalize={"none"}
              />
              <Text className="text-xs italic text-muted-foreground">
                {t("lists.smart_hint")}
              </Text>
            </View>
          )}

          <Button disabled={editIsPending} onPress={onSubmit}>
            <Text>{actions.save}</Text>
          </Button>
        </ScrollView>
      )}
    </>
  );
};

export default EditListPage;
