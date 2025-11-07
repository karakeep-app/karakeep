import React, { useLayoutEffect } from "react";
import { Tabs, useNavigation } from "expo-router";
import { StyledTabs } from "@/components/navigation/tabs";
import { useColorScheme } from "@/lib/useColorScheme";
import { ClipboardList, Home, Settings } from "lucide-react-native";

export default function TabLayout() {
  const { colors } = useColorScheme();
  const navigation = useNavigation();
  // Hide the header on the parent screen
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  return (
    <StyledTabs
      tabBarClassName="bg-gray-100 dark:bg-background"
      sceneClassName="bg-gray-100 dark:bg-background"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.foreground,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Home color={color} />,
        }}
      />
      <Tabs.Screen
        name="lists"
        options={{
          title: "Lists",
          tabBarIcon: ({ color }) => <ClipboardList color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <Settings color={color} />,
        }}
      />
    </StyledTabs>
  );
}
