import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button } from "@/components/ui/Button";
import CustomSafeAreaView from "@/components/ui/CustomSafeAreaView";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/trpc";

import { useEditBookmarkList } from "@karakeep/shared-react/hooks/lists";

const EditListPage = () => {
  const { slug: listId } = useLocalSearchParams<{ slug?: string | string[] }>();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const { toast } = useToast();
  const { mutate, isPending: editIsPending } = useEditBookmarkList({
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

  if (typeof listId !== "string") {
    throw new Error("Unexpected param type");
  }

  const { data: list, isLoading: fetchIsPending } = api.lists.get.useQuery({
    listId,
  });

  const dismiss = () => {
    router.back();
  };

  useEffect(() => {
    if (!list) return;
    setText(list.name ?? "");
    setQuery(list.query ?? "");
  }, [list?.id, list?.query, list?.name]);

  const onSubmit = () => {
    if (!text.trim()) {
      toast({ message: "List name can't be empty", variant: "destructive" });
      return;
    }

    if (list?.type === "smart" && !query.trim()) {
      toast({
        message: "Smart lists must have a search query",
        variant: "destructive",
      });
      return;
    }

    mutate({
      listId,
      name: text.trim(),
      query: list?.type === "smart" ? query.trim() : undefined,
    });
  };

  const isPending = fetchIsPending || editIsPending;

  return (
    <CustomSafeAreaView>
      {isPending ? (
        <FullPageSpinner />
      ) : (
        <View className="gap-3 px-4">
          {/* List Type Info - not editable */}
          <View className="gap-2">
            <Text className="text-sm text-muted-foreground">List Type</Text>
            <View className="flex flex-row gap-2">
              <View className="flex-1">
                <Button
                  variant={list?.type === "manual" ? "primary" : "secondary"}
                  disabled
                >
                  <Text>Manual</Text>
                </Button>
              </View>
              <View className="flex-1">
                <Button
                  variant={list?.type === "smart" ? "primary" : "secondary"}
                  disabled
                >
                  <Text>Smart</Text>
                </Button>
              </View>
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
              <Text className="text-sm text-muted-foreground">
                Search Query
              </Text>
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
      )}
    </CustomSafeAreaView>
  );
};

export default EditListPage;
