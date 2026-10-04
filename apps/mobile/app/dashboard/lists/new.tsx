import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ListParentField } from "@/components/lists/list-parent-field";
import { Button } from "@/components/ui/Button";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
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
      let errorMessage = "Something went wrong";
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
        message: "Smart lists must have a search query",
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
        <Text className="text-sm text-muted-foreground">List Type</Text>
        <View className="flex flex-row gap-2">
          <View className="flex-1">
            <Button
              variant={listType === "manual" ? "primary" : "secondary"}
              onPress={() => setListType("manual")}
            >
              <Text>Manual</Text>
            </Button>
          </View>
          <View className="flex-1">
            <Button
              variant={listType === "smart" ? "primary" : "secondary"}
              onPress={() => setListType("smart")}
            >
              <Text>Smart</Text>
            </Button>
          </View>
        </View>
      </View>

      <EmojiPicker value={icon} onChange={setIcon} />

      <Input
        className="bg-card"
        label="List Name"
        labelClasses="text-sm text-muted-foreground"
        onChangeText={setText}
        placeholder="Reading list"
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
          <Text className="text-sm text-muted-foreground">Search Query</Text>
          <Input
            className="bg-card"
            onChangeText={setQuery}
            value={query}
            placeholder="e.g., #important OR list:work"
            autoCapitalize={"none"}
          />
          <Text className="text-xs italic text-muted-foreground">
            Smart lists automatically show bookmarks matching your search query
          </Text>
        </View>
      )}

      <Button disabled={isPending} onPress={onSubmit}>
        <Text>Save</Text>
      </Button>
    </ScrollView>
  );
};

export default NewListPage;
