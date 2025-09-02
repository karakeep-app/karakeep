import type { TextInputProps } from "react-native";
import { forwardRef } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import { Text } from "@/components/ui/Text";
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
    return (
      <View className={cn("flex flex-col gap-1.5", className)}>
        {label && (
          <Text className={cn("text-base", labelClasses)}>{label}</Text>
        )}
        <TextInput
          ref={ref}
          className={cn(
            "flex h-10 w-full min-w-0 flex-row items-center rounded-md border border-input text-base leading-5 text-foreground shadow-sm shadow-black/5 dark:bg-input/30 sm:h-9",
            "rounded-lg border border-input px-4 py-2.5 placeholder:text-muted-foreground/50",
            inputClasses,
          )}
          {...props}
        />
        {loading && (
          <ActivityIndicator className="absolute bottom-0 right-0 p-2" />
        )}
      </View>
    );
  },
);
