import * as React from "react";
import { Pressable, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { TailwindResolver } from "@/components/TailwindResolver";
import { Button } from "@/components/ui/Button";
import { useColorScheme } from "@/lib/useColorScheme";
import { cn } from "@/lib/utils";
import { useAugmentedRef, useControllableState } from "@rn-primitives/hooks";
import { SearchIcon, XIcon } from "lucide-react-native";

import type { SearchInputProps } from "./types";

const SearchInput = React.forwardRef<
  React.ElementRef<typeof TextInput>,
  SearchInputProps
>(
  (
    {
      value: valueProp,
      onChangeText: onChangeTextProp,
      placeholder = "Search...",
      containerClassName,
      iconContainerClassName,
      className,
      onCancel,
      ...props
    },
    ref,
  ) => {
    const { colors } = useColorScheme();
    const inputRef = useAugmentedRef({ ref, methods: { focus, blur, clear } });
    const [value = "", onChangeText] = useControllableState({
      prop: valueProp,
      defaultProp: valueProp ?? "",
      onChange: onChangeTextProp,
    });

    function focus() {
      inputRef.current?.focus();
    }

    function blur() {
      inputRef.current?.blur();
    }

    function clear() {
      onCancel?.();
      onChangeText("");
    }

    return (
      <Button
        variant="plain"
        className={cn(
          "android:gap-0 android:h-14 flex-row items-center rounded-full bg-card px-2",
          containerClassName,
        )}
        onPress={focus}
      >
        <View
          className={cn("p-2", iconContainerClassName)}
          pointerEvents="none"
        >
          <TailwindResolver
            className="text-muted"
            comp={(styles) => (
              <SearchIcon color={styles?.color?.toString()} size={24} />
            )}
          />
        </View>

        <View className="flex-1" pointerEvents="none">
          <TextInput
            ref={inputRef}
            placeholder={placeholder}
            className={cn(
              "flex-1 rounded-r-full p-2 text-[17px] text-foreground placeholder:text-muted",
              className,
            )}
            placeholderTextColor={colors.foreground}
            value={value}
            onChangeText={onChangeText}
            role="searchbox"
            {...props}
          />
        </View>
        {!!value && (
          <Animated.View entering={FadeIn} exiting={FadeOut.duration(150)}>
            <Pressable className="p-2" onPress={clear}>
              <TailwindResolver
                className="text-muted"
                comp={(styles) => (
                  <XIcon size={24} color={styles?.color?.toString()} />
                )}
              />
            </Pressable>
          </Animated.View>
        )}
      </Button>
    );
  },
);

SearchInput.displayName = "SearchInput";

export { SearchInput };
