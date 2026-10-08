import { ActivityIndicator, Pressable, View } from "react-native";
import { RowSeparator } from "@/components/ui/GroupedList";
import { Text } from "@/components/ui/Text";
import { useColorScheme } from "@/lib/useColorScheme";
import { Check } from "lucide-react-native";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import { listNameFromPath } from "@karakeep/shared/utils/listUtils";

export interface ListPickerOption {
  id: string;
  label: string;
  state?: "selected" | "loading";
}

export function listPathToPickerOption(
  path: ZBookmarkList[],
): ListPickerOption {
  return {
    id: path[path.length - 1].id,
    label: listNameFromPath(path),
  };
}

export function ListPicker({
  options,
  onSelect,
  emptyMessage,
}: {
  options: ListPickerOption[];
  onSelect: (id: string) => void;
  emptyMessage: string;
}) {
  const { colors } = useColorScheme();

  if (options.length === 0) {
    return (
      <View className="items-center py-12">
        <Text color="tertiary">{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View
      className="overflow-hidden rounded-xl bg-card"
      style={{ borderCurve: "continuous" }}
    >
      {options.map((option, index) => {
        const isLoading = option.state === "loading";
        const isSelected = option.state === "selected";

        return (
          <View key={option.id}>
            {index > 0 && <RowSeparator />}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: isLoading,
                selected: isSelected,
              }}
              disabled={isLoading}
              onPress={() => onSelect(option.id)}
              className="min-h-12 flex-row items-center justify-between gap-3 px-4 py-3 active:opacity-70"
            >
              <Text className="flex-1" numberOfLines={2}>
                {option.label}
              </Text>
              {isLoading ? (
                <ActivityIndicator size="small" />
              ) : isSelected ? (
                <Check size={20} color={colors.primary} strokeWidth={2.5} />
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
