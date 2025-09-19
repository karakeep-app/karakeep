import { TextStyle, ViewStyle } from "react-native";
import { Stack } from "expo-router/stack";
import { cssInterop } from "nativewind";

interface StackProps extends React.ComponentProps<typeof Stack> {
  contentStyle?: ViewStyle;
  headerStyle?: TextStyle;
}

function StackImpl({ contentStyle, headerStyle, ...props }: StackProps) {
  props.screenOptions = {
    ...props.screenOptions,
    contentStyle,
    headerStyle: {
      backgroundColor: headerStyle?.backgroundColor?.toString(),
    },
    navigationBarColor: contentStyle?.backgroundColor?.toString(),
    headerTintColor: headerStyle?.color?.toString(),
  };
  return <Stack {...props} />;
}

// Changing this requires reloading the app
export const StyledStack = cssInterop(StackImpl, {
  contentClassName: "contentStyle",
  headerClassName: "headerStyle",
});
