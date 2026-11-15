import { ActivityIndicator, Pressable, View } from "react-native";
import { SelectionIndicator } from "@/components/ui/AppIcon";
import { RowSeparator } from "@/components/ui/GroupedList";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";
import { useColorScheme } from "@/lib/useColorScheme";

import { Check } from "lucide-react-native";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";

export interface ListPickerOption {
  id: string;
  label: string;
  /** Where a nested list lives. */
  detail?: string;
  state?: "selected" | "loading";
}

export function listPathToPickerOption(
  path: ZBookmarkList[],
): ListPickerOption {
  return {
    id: path[path.length - 1].id,
    label: `${path[path.length - 1].icon} ${path[path.length - 1].name}`,
    detail:
      path.length > 1
        ? path
            .slice(0, -1)
            .map((list) => list.name)
            .join(" / ")
        : undefined,
  };
}

export function byListPathName(a: ZBookmarkList[], b: ZBookmarkList[]) {
  const commonPathLength = Math.min(a.length, b.length);

  for (let index = 0; index < commonPathLength; index++) {
    const comparison = a[index].name.localeCompare(b[index].name);
    if (comparison !== 0) return comparison;
  }

  return a.length - b.length;
}

export function ListPicker({
  options,
  onSelect,
  emptyMessage,
  singleChoice = false,
}: {
  options: ListPickerOption[];
  onSelect: (id: string) => void;
  emptyMessage: string;
  /** Picking one replaces the other, so a plain checkmark, like Theme uses. */
  singleChoice?: boolean;
}) {
  const { colors } = useColorScheme();
  const { t } = useTranslation();

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
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1}>{option.label}</Text>
                {option.detail ? (
                  <Text variant="footnote" color="tertiary" numberOfLines={1}>
                    {t("lists.nested_in", { path: option.detail })}
                  </Text>
                ) : null}
              </View>
              {isLoading ? (
                <ActivityIndicator size="small" />
              ) : singleChoice ? (
                isSelected && (
                  <Check color={colors.primary} size={20} strokeWidth={2.4} />
                )
              ) : (
                <SelectionIndicator
                  selected={isSelected}
                  selectedColor={colors.primary}
                  color={colors.grey}
                />
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
