import { useState } from "react";
import { ScrollView } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";

import { useCreateTag } from "@karakeep/shared-react/hooks/tags";

export default function NewTagPage() {
  const [name, setName] = useState("");
  const { toast } = useToast();
  const { mutate: createTag, isPending } = useCreateTag({
    onSuccess: () => {
      toast({ message: "Tag created", variant: "success" });
      router.back();
    },
    onError: (error) => {
      const message = error.data?.zodError
        ? Object.values(error.data.zodError.fieldErrors).flat().join("\n")
        : error.message;
      toast({
        message: message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const onSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ message: "Tag name can't be empty", variant: "destructive" });
      return;
    }

    createTag({ name: trimmedName });
  };

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
