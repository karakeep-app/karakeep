import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button } from "@/components/ui/Button";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/trpc";

import { useEditBookmarkList } from "@karakeep/shared-react/hooks/lists";

const EditListPage = () => {
  const { listId } = useLocalSearchParams<{ listId?: string | string[] }>();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const { mutate, isPending } = useEditBookmarkList({
    onSuccess: () => {
      dismiss();
    },
  });
  const { toast } = useToast();

  if (typeof listId !== "string") {
    throw new Error("Unexpected param type");
  }

  const { data: list } = api.lists.get.useQuery({ listId });

  const dismiss = () => {
    router.back();
  };

  useEffect(() => {
    if (!list) return;
    setText(list.name ?? "");
    setQuery(list.query ?? "");
  }, [list?.id, list?.query, list?.name]);

  const onSubmit = () => {
    // TODO: This is currently not working on edit or on new list
    // Toast is covered by active modal -- needs to be fixed here and in /lists/new.tsx
    if (list?.type === "smart" && !query.trim()) {
      toast({
        message: "Smart lists must have a search query",
        variant: "destructive",
      });
      return;
    }

    mutate({
      listId: listId as string,
      name: text,
      query: list?.type === "smart" ? query : undefined,
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
              variant={list?.type === "manual" ? "primary" : "secondary"}
              className="flex-1"
              disabled
            >
              <Text>Manual</Text>
            </Button>
            <Button
              variant={list?.type === "smart" ? "primary" : "secondary"}
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
            value={text}
            placeholder="List Name"
            autoFocus
            autoCapitalize={"none"}
          />
        </View>

        {/* Smart List Query Input */}
        {list?.type === "smart" && (
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

export default EditListPage;
