import { Platform } from "react-native";
import { getLinkingURL } from "expo-linking";

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  // Android can restore the old launcher intent before delivering a widget's
  // link. Expo retains that link even before the router's listener is mounted.
  return initial && Platform.OS === "android"
    ? (getLinkingURL() ?? path)
    : path;
}
