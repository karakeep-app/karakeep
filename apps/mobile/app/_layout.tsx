import "@/globals.css";
import "expo-dev-client";

import { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Stack } from "expo-router/stack";
import { ShareIntentProvider, useShareIntent } from "expo-share-intent";
import { StatusBar } from "expo-status-bar";
import { StyledStack } from "@/components/navigation/stack";
import SplashScreenController from "@/components/SplashScreenController";
import { isIOS26 } from "@/lib/ios";
import { Providers } from "@/lib/providers";
import { useColorScheme, useInitialAndroidBarSync } from "@/lib/useColorScheme";
import { cn } from "@/lib/utils";
import { NAV_THEME } from "@/theme";
import { ThemeProvider as NavThemeProvider } from "@react-navigation/native";
import * as Sentry from "@sentry/react-native";

Sentry.init({
  dsn: "https://a61d93ed65066ed54c8566ba6b6a01d2@o4511008866172928.ingest.de.sentry.io/4511008868270160",

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: false,

  // Enable Logs
  enableLogs: false,
});

export default Sentry.wrap(function RootLayout() {
  useInitialAndroidBarSync();
  const router = useRouter();
  const { hasShareIntent } = useShareIntent();
  const { colorScheme } = useColorScheme();

  useEffect(() => {
    if (hasShareIntent) {
      router.replace({
        pathname: "sharing",
      });
    }
  }, [hasShareIntent]);

  return (
    <SafeAreaProvider>
      <KeyboardProvider
        statusBarTranslucent={Platform.OS !== "android" ? true : undefined}
        navigationBarTranslucent={Platform.OS !== "android" ? true : undefined}
      >
        <NavThemeProvider value={NAV_THEME[colorScheme]}>
          <SplashScreenController />
          <StyledStack
            layout={(props) => {
              return (
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <ShareIntentProvider>
                    <Providers>{props.children}</Providers>
                  </ShareIntentProvider>
                </GestureHandlerRootView>
              );
            }}
            contentClassName={cn(
              "w-full flex-1 bg-gray-100 text-foreground dark:bg-background",
              colorScheme == "dark" ? "dark" : "light",
            )}
            screenOptions={{
              ...Platform.select({
                ios: {
                  headerTransparent: true,
                  headerBlurEffect: isIOS26 ? undefined : "systemMaterial",
                  headerLargeTitle: true,
                  headerLargeTitleShadowVisible: false,
                  headerLargeStyle: { backgroundColor: "transparent" },
                },
              }),
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen
              name="dashboard"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="index"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="signin"
              options={{
                headerShown: true,
                headerBackVisible: true,
                headerBackTitle: "Back",
                title: "",
              }}
            />
            <Stack.Screen
              name="sharing"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="+not-found"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="server-address"
              options={{
                title: "Server Address",
                headerShown: true,
                headerTransparent: false,
                headerLargeTitle: false,
                presentation: Platform.select({
                  ios: "formSheet" as const,
                  default: "modal" as const,
                }),
              }}
            />
            <Stack.Screen
              name="test-connection"
              options={{
                title: "Test Connection",
                headerShown: true,
                headerTransparent: false,
                headerLargeTitle: false,
                presentation: Platform.select({
                  ios: "formSheet" as const,
                  default: "modal" as const,
                }),
              }}
            />
          </StyledStack>
        </NavThemeProvider>
      </KeyboardProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
});
