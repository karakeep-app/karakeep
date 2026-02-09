import { SplashScreen } from "expo-router";
import useAppSettings from "@/lib/settings";

SplashScreen.preventAutoHideAsync();

export default function SplashScreenController() {
  const { isLoading } = useAppSettings();

  if (!isLoading) {
    SplashScreen.hide();
  }

  return null;
}
