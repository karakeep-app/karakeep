import { Pressable, StyleSheet, View } from "react-native";
import ChevronRight from "@/components/ui/ChevronRight";
import { Text } from "@/components/ui/Text";

/**
 * iOS-style grouped table section with an optional section label, footer and
 * a rounded card container for its children.
 */
function GroupedSection({
  children,
  header,
  footer,
}: {
  children: React.ReactNode;
  header?: string;
  footer?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      {header && <GroupedHeader label={header} />}
      <View
        className="overflow-hidden rounded-xl bg-card"
        style={{ borderCurve: "continuous" }}
      >
        {children}
      </View>
      {footer && (
        <Text variant="footnote" color="tertiary" className="px-4">
          {footer}
        </Text>
      )}
    </View>
  );
}

function GroupedHeader({ label }: { label: string }) {
  return (
    <Text variant="footnote" color="tertiary" className="px-4 uppercase">
      {label}
    </Text>
  );
}

/**
 * One row of a virtualized grouped list. Lists can't wrap their rows in a
 * GroupedSection, so each row draws its own part of the rounded container.
 */
function GroupedListRow({
  children,
  isFirst,
  isLast,
  separatorInset = 16,
}: {
  children: React.ReactNode;
  isFirst: boolean;
  isLast: boolean;
  separatorInset?: number;
}) {
  return (
    <View
      className="overflow-hidden bg-card"
      style={{
        borderCurve: "continuous",
        borderTopLeftRadius: isFirst ? 12 : 0,
        borderTopRightRadius: isFirst ? 12 : 0,
        borderBottomLeftRadius: isLast ? 12 : 0,
        borderBottomRightRadius: isLast ? 12 : 0,
      }}
    >
      {children}
      {!isLast && (
        <View
          className="bg-border"
          style={{
            height: StyleSheet.hairlineWidth,
            marginLeft: separatorInset,
          }}
        />
      )}
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
      className="ml-4 bg-border"
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
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-11 flex-row items-center justify-between gap-3 px-4 py-2.5 active:opacity-70"
    >
      <Text className="flex-1" numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text color="tertiary" className="max-w-[55%]" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <ChevronRight size={16} />
    </Pressable>
  );
}

export {
  GroupedHeader,
  GroupedListRow,
  GroupedSection,
  NavigationRow,
  RowSeparator,
};
