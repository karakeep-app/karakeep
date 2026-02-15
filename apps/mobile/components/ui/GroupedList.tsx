import { Pressable, StyleSheet, View } from "react-native";
import ChevronRight from "@/components/ui/ChevronRight";
import { Text } from "@/components/ui/Text";

/**
 * iOS-style grouped table section with an optional uppercase header label
 * and a rounded card container for its children.
 */
function GroupedSection({
  children,
  header,
}: {
  children: React.ReactNode;
  header?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      {header && (
        <Text variant="footnote" color="tertiary" className="px-5 uppercase">
          {header}
        </Text>
      )}
      <View
        className="overflow-hidden rounded-xl bg-card"
        style={{ borderCurve: "continuous" }}
      >
        {children}
      </View>
    </View>
  );
}

/**
 * Hairline separator indented from the left, used between rows
 * within a GroupedSection.
 */
function RowSeparator() {
  return (
    <View
      className="ml-4 bg-border/30"
      style={{ height: StyleSheet.hairlineWidth }}
    />
  );
}

/**
 * A pressable row with a label and a trailing chevron,
 * used for drill-down navigation within a GroupedSection.
 */
function NavigationRow({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between px-4 py-3 active:opacity-70"
    >
      <Text>{label}</Text>
      <ChevronRight size={16} />
    </Pressable>
  );
}

export { GroupedSection, NavigationRow, RowSeparator };
