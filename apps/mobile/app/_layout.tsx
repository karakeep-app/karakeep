import "@/globals.css";
import "expo-dev-client";

import type React from "react";
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
import { Providers } from "@/lib/providers";
import { useColorScheme, useInitialAndroidBarSync } from "@/lib/useColorScheme";
import { cn } from "@/lib/utils";
import { NAV_THEME } from "@/theme";
import { ThemeProvider as NavThemeProvider } from "@react-navigation/native";

// On Android, KeyboardProvider's EdgeToEdgeReactViewGroup intercepts window insets at
// the root view level, zeroing out the status bar top inset. This prevents the native
// navigation toolbar (react-native-screens' CustomToolbar) from receiving the correct
// system bar insets, resulting in headers appearing cramped against the status bar.
// We skip KeyboardProvider on Android entirely to let the toolbar handle its own insets.
function RootKeyboardProvider({ children }: { children: React.ReactNode }) {
  if (Platform.OS === "android") {
    return children;
  }
  return (
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      {children}
    </KeyboardProvider>
  );
}

export default function RootLayout() {
  useInitialAndroidBarSync();
  const router = useRouter();
  const { hasShareIntent } = useShareIntent();
  const { colorScheme, isDarkColorScheme } = useColorScheme();

  useEffect(() => {
    if (hasShareIntent) {
      router.replace({
        pathname: "sharing",
      });
    }
  }, [hasShareIntent]);

  return (
    <SafeAreaProvider>
      <RootKeyboardProvider>
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
                  headerBlurEffect: "systemMaterial",
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
      </RootKeyboardProvider>
      <StatusBar
        key={`root-status-bar-${isDarkColorScheme ? "light" : "dark"}`}
        style={isDarkColorScheme ? "light" : "dark"}
      />
    </SafeAreaProvider>
  );
}
