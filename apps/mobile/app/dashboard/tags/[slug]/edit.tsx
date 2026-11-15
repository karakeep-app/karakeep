import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import QueryPageState from "@/components/QueryPageState";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { Input } from "@/components/ui/Input";
import { SheetHeader, useDiscardGuard } from "@/components/ui/SheetHeader";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useCommonStrings, useTranslation } from "@/lib/i18n/hooks";
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
  const { t } = useTranslation();
  const strings = useCommonStrings();

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
      toast({ message: t("tags.updated"), variant: "success" });
      allowLeave();
      router.back();
    },
    onError: (mutationError) => {
      const message = mutationError.data?.zodError
        ? Object.values(mutationError.data.zodError.fieldErrors)
            .flat()
            .join("\n")
        : mutationError.message;
      toast({
        message: message || strings.somethingWentWrong,
        variant: "destructive",
      });
    },
  });

  const allowLeave = useDiscardGuard(!!tag && name !== tag.name);

  useEffect(() => {
    if (tag) {
      setName(tag.name);
    }
  }, [tag]);

  const onSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ message: t("tags.name_empty"), variant: "destructive" });
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
      contentContainerClassName="gap-4 px-4 pt-2 pb-8"
    >
      <SheetHeader
        onSave={onSubmit}
        saveDisabled={!name.trim()}
        isSaving={isPending}
      />
      <Input
        accessibilityLabel={t("tags.name_field")}
        onChangeText={setName}
        onSubmitEditing={onSubmit}
        value={name}
        placeholder={t("tags.name_field")}
        autoCapitalize="none"
        returnKeyType="done"
      />
      <Text variant="footnote" color="tertiary" className="-mt-2 px-4">
        {t("tags.rename_hint")}
      </Text>
    </ScrollView>
  );
}
