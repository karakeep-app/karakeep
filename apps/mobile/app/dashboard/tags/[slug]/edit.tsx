import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import QueryPageState from "@/components/QueryPageState";
import { Button } from "@/components/ui/Button";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useQuery } from "@tanstack/react-query";

import { useUpdateTag } from "@karakeep/shared-react/hooks/tags";
import { useTRPC } from "@karakeep/shared-react/trpc";

export default function EditTagPage() {
  const { slug: tagId } = useLocalSearchParams<{
    slug?: string | string[];
  }>();
  const [name, setName] = useState("");
  const api = useTRPC();
  const { toast } = useToast();

  if (typeof tagId !== "string") {
    throw new Error("Unexpected param type");
  }

  const {
    data: tag,
    error,
    refetch,
  } = useQuery(api.tags.get.queryOptions({ tagId }));
  const { mutate: updateTag, isPending } = useUpdateTag({
    onSuccess: () => {
      toast({ message: "Tag updated", variant: "success" });
      router.back();
    },
    onError: (mutationError) => {
      const message = mutationError.data?.zodError
        ? Object.values(mutationError.data.zodError.fieldErrors)
            .flat()
            .join("\n")
        : mutationError.message;
      toast({
        message: message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (tag) {
      setName(tag.name);
    }
  }, [tag]);

  const onSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ message: "Tag name can't be empty", variant: "destructive" });
      return;
    }

    updateTag({ tagId, name: trimmedName });
  };

  if (!tag) {
    return <QueryPageState error={error} onRetry={() => refetch()} />;
  }

  if (isPending) {
    return <FullPageSpinner />;
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-4 px-4 pb-8"
    >
      <Input
        label="Tag Name"
        labelClasses="text-sm text-muted-foreground"
        inputClasses="bg-card"
        onChangeText={setName}
        onSubmitEditing={onSubmit}
        value={name}
        placeholder="Reading"
        autoFocus
        autoCapitalize="sentences"
        returnKeyType="done"
      />

      <Button disabled={isPending} onPress={onSubmit}>
        <Text>Save</Text>
      </Button>
    </ScrollView>
  );
}
