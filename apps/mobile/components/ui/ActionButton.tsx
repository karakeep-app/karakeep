import type { PressableProps } from "react-native";
import { ActivityIndicator, Pressable } from "react-native";

export function ActionButton({
  children,
  loading,
  disabled,
  ...props
}: PressableProps & {
  loading: boolean;
}) {
  if (disabled !== undefined) {
    disabled ||= loading;
  } else if (loading) {
    disabled = true;
  }
  return (
    <Pressable {...props} disabled={disabled}>
      {loading ? <ActivityIndicator /> : children}
    </Pressable>
  );
}
