import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ListParentField } from "@/components/lists/list-parent-field";
import { Button } from "@/components/ui/Button";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import {
  useCommonActions,
  useCommonStrings,
  useTranslation,
} from "@/lib/i18n/hooks";
import { NO_PARENT_VALUE } from "@/lib/list-parent-selection";

import { useCreateBookmarkList } from "@karakeep/shared-react/hooks/lists";

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
  const actions = useCommonActions();
  const strings = useCommonStrings();
  const [text, setText] = useState("");
  const [icon, setIcon] = useState("📁");
  const [listType, setListType] = useState<ListType>("manual");
  const [query, setQuery] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);

  React.useEffect(() => {
    if (typeof selectedParentId !== "string") return;
    setParentId(selectedParentId === NO_PARENT_VALUE ? null : selectedParentId);
    router.setParams({ selectedParentId: undefined });
  }, [selectedParentId]);

  const { mutate, isPending } = useCreateBookmarkList({
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

  const onSubmit = () => {
    // Validate smart list has a query
    if (listType === "smart" && !query.trim()) {
      toast({
        message: t("lists.smart_needs_query"),
        variant: "destructive",
      });
      return;
    }

    mutate({
      name: text,
      icon,
      type: listType,
      query: listType === "smart" ? query : undefined,
      parentId,
    });
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-4 px-4 pb-8"
    >
      {/* List Type Selector */}
      <View className="gap-2">
        <Text className="text-sm text-muted-foreground">
          {t("lists.type_label")}
        </Text>
        <View className="flex flex-row gap-2">
          <View className="flex-1">
            <Button
              variant={listType === "manual" ? "primary" : "secondary"}
              onPress={() => setListType("manual")}
            >
              <Text>{t("lists.type_manual")}</Text>
            </Button>
          </View>
          <View className="flex-1">
            <Button
              variant={listType === "smart" ? "primary" : "secondary"}
              onPress={() => setListType("smart")}
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
              returnTo: "new",
              selectedParentId: parentId ?? NO_PARENT_VALUE,
            },
          })
        }
      />

      {/* Smart List Query Input */}
      {listType === "smart" && (
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

      <Button disabled={isPending} onPress={onSubmit}>
        <Text>{actions.save}</Text>
      </Button>
    </ScrollView>
  );
};

export default NewListPage;
