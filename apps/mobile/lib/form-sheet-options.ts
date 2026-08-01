import type { ColorValue } from "react-native";

export function getFormSheetSurfaceOptions(backgroundColor: ColorValue) {
  return {
    contentStyle: { backgroundColor },
    headerStyle: { backgroundColor },
  };
}
