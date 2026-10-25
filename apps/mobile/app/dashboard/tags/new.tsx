import { useState } from "react";
import { ScrollView } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import {
  useCommonActions,
  useCommonStrings,
  useTranslation,
} from "@/lib/i18n/hooks";

import { useCreateTag } from "@karakeep/shared-react/hooks/tags";

export default function NewTagPage() {
  const [name, setName] = useState("");
  const { toast } = useToast();
  const { t } = useTranslation();
  const actions = useCommonActions();
  const strings = useCommonStrings();
  const { mutate: createTag, isPending } = useCreateTag({
    onSuccess: () => {
      toast({ message: t("tags.created"), variant: "success" });
      router.back();
    },
    onError: (error) => {
      const message = error.data?.zodError
        ? Object.values(error.data.zodError.fieldErrors).flat().join("\n")
        : error.message;
      toast({
        message: message || strings.somethingWentWrong,
        variant: "destructive",
      });
    },
  });

  const onSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ message: t("tags.name_empty"), variant: "destructive" });
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
        label={t("tags.name_label")}
        labelClasses="text-sm text-muted-foreground"
        inputClasses="bg-card"
        onChangeText={setName}
        onSubmitEditing={onSubmit}
        value={name}
        placeholder={t("tags.name_placeholder")}
        autoFocus
        autoCapitalize="sentences"
        returnKeyType="done"
      />

      <Button disabled={isPending} onPress={onSubmit}>
        <Text>{actions.save}</Text>
      </Button>
    </ScrollView>
  );
}
