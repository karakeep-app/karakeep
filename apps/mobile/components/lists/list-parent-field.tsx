import { ActivityIndicator, Pressable, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";
import { useColorScheme } from "@/lib/useColorScheme";
import { ChevronRight } from "lucide-react-native";

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
  const { colors } = useColorScheme();
  const { data, isPending } = useBookmarkLists();
  const selectedPath = value ? data?.getPathById(value) : undefined;
  const selectedName =
    value === null
      ? t("lists.no_parent")
      : selectedPath
        ? listNameFromPath(selectedPath)
        : isPending
          ? t("settings.loading")
          : t("lists.parent_unavailable");

  return (
    <View className="gap-2">
      <Text className="text-sm text-muted-foreground">
        {t("lists.parent_label")}
      </Text>
      <Pressable
        accessibilityLabel={t("lists.parent_label") + `: ${selectedName}`}
        accessibilityHint={t("lists.parent_hint")}
        accessibilityRole="button"
        onPress={onPress}
        className="min-h-11 flex-row items-center justify-between gap-3 rounded-xl border border-input bg-card px-4 py-3 active:opacity-70"
        style={{ borderCurve: "continuous" }}
      >
        <Text className="flex-1" numberOfLines={1}>
          {selectedName}
        </Text>
        {isPending && value !== null ? (
          <ActivityIndicator size="small" />
        ) : (
          <ChevronRight size={18} color={colors.grey} />
        )}
      </Pressable>
    </View>
  );
}
