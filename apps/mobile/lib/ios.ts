import { Platform } from "react-native";
import { isGlassEffectAPIAvailable } from "expo-glass-effect";

export const isIOS26 =
  Platform.OS === "ios" && parseInt(Platform.Version as string, 10) >= 26;

export const shouldUseGlassPill = isIOS26 && isGlassEffectAPIAvailable();
