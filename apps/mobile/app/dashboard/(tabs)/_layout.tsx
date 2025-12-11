import React, { useLayoutEffect } from "react";
import { Tabs, useNavigation } from "expo-router";
import { StyledTabs } from "@/components/navigation/tabs";
import { useColorScheme } from "@/lib/useColorScheme";
import {
  ClipboardList,
  Highlighter,
  Home,
  Settings,
  Tag,
} from "lucide-react-native";

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
        name="tags"
        options={{
          title: "Tags",
          tabBarIcon: ({ color }) => <Tag color={color} />,
        }}
      />
      <Tabs.Screen
        name="highlights"
        options={{
          title: "Highlights",
          tabBarIcon: ({ color }) => <Highlighter color={color} />,
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
