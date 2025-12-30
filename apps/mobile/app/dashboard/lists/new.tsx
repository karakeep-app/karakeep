import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/ui/Button";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";

import { useCreateBookmarkList } from "@karakeep/shared-react/hooks/lists";

type ListType = "manual" | "smart";

const NewListPage = () => {
  const dismiss = () => {
    router.back();
  };
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [listType, setListType] = useState<ListType>("manual");
  const [query, setQuery] = useState("");

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
      icon: "🚀",
      type: listType,
      query: listType === "smart" ? query : undefined,
    });
  };

  return (
    <CustomSafeAreaView>
      <View className="gap-3 px-4">
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

        {/* List Name */}
        <View className="flex flex-row items-center gap-1">
          <Text className="shrink p-2">🚀</Text>
          <Input
            className="flex-1 bg-card"
            onChangeText={setText}
            placeholder="List Name"
            autoFocus
            autoCapitalize={"none"}
          />
        </View>

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
              Smart lists automatically show bookmarks matching your search
              query
            </Text>
          </View>
        )}

        <Button disabled={isPending} onPress={onSubmit}>
          <Text>Save</Text>
        </Button>
      </View>
    </CustomSafeAreaView>
  );
};

export default NewListPage;
