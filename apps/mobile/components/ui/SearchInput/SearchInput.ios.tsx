import type {
  NativeSyntheticEvent,
  TextInputFocusEventData,
} from "react-native";
import * as React from "react";
import { Pressable, TextInput, View, ViewStyle } from "react-native";
import Animated, {
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import { TailwindResolver } from "@/components/TailwindResolver";
import { Text } from "@/components/ui/Text";
import { cn } from "@/lib/utils";
import { useAugmentedRef, useControllableState } from "@rn-primitives/hooks";
import { SearchIcon } from "lucide-react-native";

import type { SearchInputProps } from "./types";

// Add as class when possible: https://github.com/marklawlor/nativewind/issues/522
const BORDER_CURVE: ViewStyle = {
  borderCurve: "continuous",
};

const SearchInput = React.forwardRef<
  React.ElementRef<typeof TextInput>,
  SearchInputProps
>(
  (
    {
      value: valueProp,
      onChangeText: onChangeTextProp,
      onFocus: onFocusProp,
      placeholder = "Search...",
      cancelText = "Cancel",
      containerClassName,
      iconContainerClassName,
      className,
      iconColor: _iconColor,
      onCancel,
      ...props
    },
    ref,
  ) => {
    const inputRef = useAugmentedRef({ ref, methods: { focus, blur, clear } });
    const [showCancel, setShowCancel] = React.useState(false);
    const showCancelDerivedValue = useDerivedValue(
      () => showCancel,
      [showCancel],
    );
    const animatedRef = useAnimatedRef();

    const [value = "", onChangeText] = useControllableState({
      prop: valueProp,
      defaultProp: valueProp ?? "",
      onChange: onChangeTextProp,
    });

    const rootStyle = useAnimatedStyle(() => {
      if (_WORKLET) {
        // safely use measure
        const measurement = measure(animatedRef);
        return {
          paddingRight: showCancelDerivedValue.value
            ? withTiming(measurement?.width ?? cancelText.length * 11.2)
            : withTiming(0),
        };
      }
      return {
        paddingRight: showCancelDerivedValue.value
          ? withTiming(cancelText.length * 11.2)
          : withTiming(0),
      };
    });
    const buttonStyle3 = useAnimatedStyle(() => {
      if (_WORKLET) {
        // safely use measure
        const measurement = measure(animatedRef);
        return {
          position: "absolute",
          right: 0,
          opacity: showCancelDerivedValue.value ? withTiming(1) : withTiming(0),
          transform: [
            {
              translateX: showCancelDerivedValue.value
                ? withTiming(0)
                : measurement?.width
                  ? withTiming(measurement.width)
                  : cancelText.length * 11.2,
            },
          ],
        };
      }
      return {
        position: "absolute",
        right: 0,
        opacity: showCancelDerivedValue.value ? withTiming(1) : withTiming(0),
        transform: [
          {
            translateX: showCancelDerivedValue.value
              ? withTiming(0)
              : withTiming(cancelText.length * 11.2),
          },
        ],
      };
    });

    function focus() {
      inputRef.current?.focus();
    }

    function blur() {
      inputRef.current?.blur();
    }

    function clear() {
      onChangeText("");
    }

    function onFocus(e: NativeSyntheticEvent<TextInputFocusEventData>) {
      setShowCancel(true);
      onFocusProp?.(e);
    }

    return (
      <Animated.View className="flex-row items-center" style={rootStyle}>
        <Animated.View
          style={BORDER_CURVE}
          className={cn(
            "flex-1 flex-row rounded-lg bg-card",
            containerClassName,
          )}
        >
          <View
            className={cn(
              "absolute bottom-0 left-0 top-0 z-50 justify-center pl-1.5",
              iconContainerClassName,
            )}
          >
            <TailwindResolver
              className="text-muted"
              comp={(styles) => (
                <SearchIcon color={styles?.color?.toString()} size={20} />
              )}
            />
          </View>
          <TextInput
            ref={inputRef}
            placeholder={placeholder}
            className={cn(
              !showCancel && "active:bg-muted/5 dark:active:bg-muted/20",
              "flex-1 rounded-lg py-2 pl-8 pr-1  text-[17px] text-foreground",
              className,
            )}
            value={value}
            onChangeText={onChangeText}
            onFocus={onFocus}
            clearButtonMode="while-editing"
            role="searchbox"
            {...props}
          />
        </Animated.View>
        <Animated.View
          ref={animatedRef}
          style={buttonStyle3}
          pointerEvents={!showCancel ? "none" : "auto"}
        >
          <Pressable
            onPress={() => {
              onChangeText("");
              inputRef.current?.blur();
              setShowCancel(false);
              onCancel?.();
            }}
            disabled={!showCancel}
            pointerEvents={!showCancel ? "none" : "auto"}
            className="flex-1 justify-center active:opacity-50"
          >
            <Text className="px-2 text-primary">{cancelText}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    );
  },
);

SearchInput.displayName = "SearchInput";

export { SearchInput };
