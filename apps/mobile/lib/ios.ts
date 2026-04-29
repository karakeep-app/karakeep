import { Platform } from "react-native";
import { isGlassEffectAPIAvailable } from "expo-glass-effect";

export const isIOS26 =
  Platform.OS === "ios" && parseInt(Platform.Version as string, 10) >= 26;

export const shouldUseGlassPill = isIOS26 && isGlassEffectAPIAvailable();

// Standard iOS navigation bar height (points). Used to size the bottom
// toolbar so it visually matches the header.
export const NAV_BAR_HEIGHT = 44;
