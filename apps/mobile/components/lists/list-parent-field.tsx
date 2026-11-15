import { ActivityIndicator, Pressable } from "react-native";
import ChevronRight from "@/components/ui/ChevronRight";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { listNameFromPath } from "@karakeep/shared/utils/listUtils";

export function ListParentField({
  value,
  onPress,
}: {
  value: string | null;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { data, isPending } = useBookmarkLists();
  const selectedPath = value ? data?.getPathById(value) : undefined;
  const selectedName =
    value === null
      ? t("lists.parent_none")
      : selectedPath
        ? listNameFromPath(selectedPath)
        : isPending
          ? t("settings.loading")
          : t("lists.parent_unavailable");

  return (
    <Pressable
      accessibilityLabel={t("lists.parent_a11y_label", { name: selectedName })}
      accessibilityHint={t("lists.parent_hint")}
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-11 flex-row items-center gap-3 px-4 py-2.5 active:opacity-70"
    >
      <Text className="flex-1">{t("lists.parent_label")}</Text>
      <Text color="tertiary" className="max-w-[60%]" numberOfLines={1}>
        {selectedName}
      </Text>
      {isPending && value !== null ? (
        <ActivityIndicator size="small" />
      ) : (
        <ChevronRight size={16} />
      )}
    </Pressable>
  );
}
