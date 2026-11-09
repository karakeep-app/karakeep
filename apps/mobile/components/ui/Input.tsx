import type { TextInputProps } from "react-native";
import { forwardRef } from "react";
import { ActivityIndicator, Platform, TextInput, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { useColorScheme } from "@/lib/useColorScheme";
import { cn } from "@/lib/utils";

export interface InputProps extends TextInputProps {
  label?: string;
  labelClasses?: string;
  inputClasses?: string;
  loading?: boolean;
}

export const Input = forwardRef<TextInput, InputProps>(
  (
    { className, label, labelClasses, inputClasses, loading, ...props },
    ref,
  ) => {
    const { colors } = useColorScheme();
    return (
      <View className={cn("flex w-full flex-col gap-1.5", className)}>
        {label && (
          <Text className={cn("text-base", labelClasses)}>{label}</Text>
        )}
        <TextInput
          ref={ref}
          selectionColor={Platform.OS === "ios" ? colors.primary : undefined}
          className={cn(
            "w-full min-w-0 rounded-xl bg-card px-4 text-[17px] leading-[22px] text-foreground placeholder:text-muted-foreground/80",
            props.multiline ? "min-h-28 py-3" : "h-11",
            inputClasses,
          )}
          {...props}
          style={[{ borderCurve: "continuous" }, props.style]}
        />
        {loading && (
          <ActivityIndicator className="absolute bottom-0 right-0 p-2" />
        )}
      </View>
    );
  },
);
