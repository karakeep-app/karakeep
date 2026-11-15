import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Text } from "@/components/ui/Text";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row rounded-[10px] bg-muted/25 p-0.5"
      style={{ borderCurve: "continuous" }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className={
              selected
                ? "flex-1 items-center rounded-lg bg-card py-1.5 shadow-sm shadow-black/10 dark:bg-muted/70"
                : "flex-1 items-center rounded-lg py-1.5 active:opacity-60"
            }
            style={{ borderCurve: "continuous" }}
            onPress={() => {
              if (!selected) {
                void Haptics.selectionAsync();
                onChange(option.value);
              }
            }}
          >
            <Text
              variant="subhead"
              className={selected ? "font-semibold" : undefined}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
