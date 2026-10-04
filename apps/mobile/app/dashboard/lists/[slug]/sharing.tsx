import { Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

import { ListSharingSettings } from "@/components/lists/list-sharing-settings";
import QueryPageState from "@/components/QueryPageState";
import { Text } from "@/components/ui/Text";

export default function ListSharingPage() {
  const { slug } = useLocalSearchParams();
  const api = useTRPC();
  if (typeof slug !== "string") throw new Error("Unexpected param type");
  const {
    data: list,
    error,
    refetch,
  } = useQuery(api.lists.get.queryOptions({ listId: slug }));
  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: "Sharing & Access",
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              className="px-2"
            >
              <Text className="text-primary">Done</Text>
            </Pressable>
          ),
        }}
      />
      {list ? (
        <KeyboardAwareScrollView
          bottomOffset={16}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          className="flex-1 bg-background"
        >
          <ListSharingSettings list={list} />
        </KeyboardAwareScrollView>
      ) : (
        <QueryPageState error={error} onRetry={() => refetch()} />
      )}
    </>
  );
}
