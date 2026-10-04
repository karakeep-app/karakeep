import type { ComponentProps, ReactNode } from "react";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { useHeaderHeight } from "expo-router/react-navigation";
import ChevronRight from "@/components/ui/ChevronRight";
import { Text } from "@/components/ui/Text";
import { useColorScheme } from "@/lib/useColorScheme";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react-native";

function SettingsScreen({
  children,
  contentContainerStyle,
  ...props
}: Omit<
  ComponentProps<typeof ScrollView>,
  "contentContainerStyle" | "contentInsetAdjustmentBehavior"
> & {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const headerHeight = useHeaderHeight();

  return (
    <ScrollView
      {...props}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        {
          gap: 24,
          paddingBottom: 40 + headerHeight,
          paddingHorizontal: 16,
          paddingTop: 12,
        },
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}

function SettingsGroup({
  children,
  footer,
  header,
}: {
  children: ReactNode;
  footer?: string;
  header?: string;
}) {
  return (
    <View className="gap-1.5">
      {header ? (
        <Text
          variant="footnote"
          color="tertiary"
          className="px-4 uppercase tracking-wide"
        >
          {header}
        </Text>
      ) : null}
      <View
        className="overflow-hidden rounded-xl bg-card py-2"
        style={{ borderCurve: "continuous" }}
      >
        {children}
      </View>
      {footer ? (
        <Text variant="footnote" color="tertiary" className="px-4 pt-1">
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

function SettingsSeparator({
  className,
  style,
}: {
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      className={cn("mx-6 my-1 bg-border", className)}
      style={[{ height: StyleSheet.hairlineWidth }, style]}
    />
  );
}

function SettingsNavigationRow({
  isLoading = false,
  label,
  onPress,
  value,
}: {
  isLoading?: boolean;
  label: string;
  onPress: () => void;
  value?: string;
}) {
  return (
    <Pressable
      accessibilityHint={`Opens ${label} settings`}
      accessibilityRole="button"
      className="flex-row items-center px-4 py-1 active:bg-muted/10"
      onPress={onPress}
    >
      <Text className="mr-3 flex-1" numberOfLines={1}>
        {label}
      </Text>
      {isLoading ? (
        <ActivityIndicator className="mr-2" size="small" />
      ) : value ? (
        <Text color="tertiary" className="mr-2 max-w-[45%]" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <ChevronRight size={17} strokeWidth={2.25} />
    </Pressable>
  );
}

function SettingsToggleRow({
  disabled = false,
  label,
  onValueChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <View className="flex-row items-center px-4 py-1">
      <Text className="mr-3 flex-1">{label}</Text>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={onValueChange}
        value={value}
      />
    </View>
  );
}

function SettingsChoiceRow({
  description,
  disabled = false,
  label,
  labelStyle,
  onPress,
  selected,
}: {
  description?: string;
  disabled?: boolean;
  label: string;
  labelStyle?: StyleProp<TextStyle>;
  onPress: () => void;
  selected: boolean;
}) {
  const { colors } = useColorScheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      className={cn(
        "flex-row items-center px-4 active:bg-muted/10",
        description ? "min-h-16 py-2" : "py-1",
      )}
      disabled={disabled}
      onPress={onPress}
    >
      <View className="mr-3 flex-1 gap-0.5">
        <Text numberOfLines={1} style={labelStyle}>
          {label}
        </Text>
        {description ? (
          <Text variant="footnote" color="tertiary">
            {description}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <Check color={colors.primary} size={22} strokeWidth={2.4} />
      ) : null}
    </Pressable>
  );
}

function SettingsValueRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-4 px-4 py-1">
      <Text className="flex-1">{label}</Text>
      <Text
        selectable
        color="tertiary"
        className="max-w-[60%] text-right"
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function SettingsActionRow({
  centered = false,
  disabled = false,
  isLoading = false,
  label,
  leading,
  onPress,
  tone = "destructive",
}: {
  centered?: boolean;
  disabled?: boolean;
  isLoading?: boolean;
  label: string;
  leading?: ReactNode;
  onPress: () => void;
  tone?: "default" | "destructive" | "primary";
}) {
  const textClassName = disabled
    ? "text-muted-foreground"
    : tone === "primary"
      ? "text-primary"
      : tone === "destructive"
        ? "text-destructive"
        : "text-foreground";

  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        "flex-row items-center gap-2 px-4 py-1 active:bg-muted/10",
        centered ? "justify-center" : undefined,
      )}
      disabled={disabled}
      onPress={onPress}
    >
      {isLoading ? (
        <ActivityIndicator size="small" />
      ) : (
        <>
          {leading}
          <Text className={textClassName}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export {
  SettingsActionRow,
  SettingsChoiceRow,
  SettingsGroup,
  SettingsNavigationRow,
  SettingsScreen,
  SettingsSeparator,
  SettingsToggleRow,
  SettingsValueRow,
};
