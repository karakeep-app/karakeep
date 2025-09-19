import { TextStyle, ViewStyle } from "react-native";
import { cssInterop } from "nativewind";

function TailwindResolverImpl({
  comp,
  style,
}: {
  comp: (style?: ViewStyle & TextStyle) => React.ReactNode;
  style?: ViewStyle & TextStyle;
}) {
  return comp(style);
}

export const TailwindResolver = cssInterop(TailwindResolverImpl, {
  className: "style",
});
