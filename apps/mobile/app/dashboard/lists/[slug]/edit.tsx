import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button } from "@/components/ui/Button";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/trpc";

import { useEditBookmarkList } from "@karakeep/shared-react/hooks/lists";

// TODO Duplicated from new -- import from somewhere
type ListType = "manual" | "smart";

const EditListPage = () => {
  const [text, setText] = useState("");
  const [listType, setListType] = useState<ListType>("manual");
  const [query, setQuery] = useState("");
  const { listId } = useLocalSearchParams();
  const { data: list } = api.lists.get.useQuery({ listId: listId as string });
  const { mutate, isPending } = useEditBookmarkList({
    onSuccess: () => {
      dismiss();
    },
  });
  const { toast } = useToast();
  const dismiss = () => {
    router.back();
  };

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
      listId: listId as string,
      name: text,
      query: listType === "smart" ? query : undefined,
    });
  };

  return (
    <CustomSafeAreaView>
      <View className="gap-3 px-4">
        {/* List Type Info - not editable */}
        <View className="gap-2">
          <Text className="text-sm text-muted-foreground">List Type</Text>
          <View className="flex flex-row gap-2">
            <Button
              variant={listType === "manual" ? "primary" : "secondary"}
              onPress={() => setListType("manual")}
              className="flex-1"
              disabled
            >
              <Text>Manual</Text>
            </Button>
            <Button
              variant={listType === "smart" ? "primary" : "secondary"}
              onPress={() => setListType("smart")}
              className="flex-1"
              disabled
            >
              <Text>Smart</Text>
            </Button>
          </View>
        </View>

        {/* List Name */}
        <View className="flex flex-row items-center gap-1">
          <Text className="shrink p-2">{list?.icon || "🚀"}</Text>
          <Input
            className="flex-1 bg-card"
            onChangeText={setText}
            placeholder="List Name"
            autoFocus
            autoCapitalize={"none"}
            defaultValue={list?.name}
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
              defaultValue={list?.type}
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

export default EditListPage;
