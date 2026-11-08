import { useState } from "react";
import { ScrollView } from "react-native";
import { router } from "expo-router";
import { Input } from "@/components/ui/Input";
import { SheetHeader } from "@/components/ui/SheetHeader";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useTranslation } from "@/lib/i18n/hooks";

import { useCreateTag } from "@karakeep/shared-react/hooks/tags";

export default function NewTagPage() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { mutate: createTag, isPending } = useCreateTag({
    onSuccess: () => {
      toast({ message: t("tags.created"), variant: "success" });
      router.back();
    },
    onError: (error) => {
      const message = error.data?.zodError
        ? Object.values(error.data.zodError.fieldErrors).flat().join("\n")
        : error.message;
      setError(
        message?.toLowerCase().includes("already exists")
          ? t("tags.already_exists", { name: name.trim() })
          : message || t("tags.something_went_wrong_try_again"),
      );
    },
  });

  const trimmedName = name.trim();

  const onSubmit = () => {
    if (trimmedName) {
      createTag({ name: trimmedName });
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-4 px-4 pt-2 pb-8"
    >
      <SheetHeader
        onSave={onSubmit}
        saveDisabled={!trimmedName}
        isDirty={!!trimmedName}
        isSaving={isPending}
      />
      <Input
        accessibilityLabel={t("tags.name_field")}
        onChangeText={(value) => {
          setName(value);
          setError(undefined);
        }}
        onSubmitEditing={onSubmit}
        value={name}
        placeholder={t("tags.name_field")}
        autoFocus
        autoCapitalize="none"
        returnKeyType="done"
      />
      {error ? (
        <Text variant="footnote" className="-mt-2 px-4 text-destructive">
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}
