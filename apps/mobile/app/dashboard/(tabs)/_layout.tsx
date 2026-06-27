import React from "react";
import { Platform } from "react-native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { isIOS26 } from "@/lib/ios";
import { useColorScheme } from "@/lib/useColorScheme";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

export default function TabLayout() {
  const { colors } = useColorScheme();
  return (
    <NativeTabs
      backgroundColor={colors.grey6}
      minimizeBehavior={Platform.select({
        ios: "never",
        default: "onScrollDown",
      })}
      labelVisibilityMode={Platform.select({ android: "labeled" })}
    >
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Icon
          sf="house.fill"
          src={
            <NativeTabs.Trigger.VectorIcon
              family={MaterialCommunityIcons}
              name="home"
            />
          }
        />
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(lists)">
        <NativeTabs.Trigger.Icon
          sf="list.clipboard.fill"
          src={
            <NativeTabs.Trigger.VectorIcon
              family={MaterialCommunityIcons}
              name="clipboard-list"
            />
          }
        />
        <NativeTabs.Trigger.Label>Lists</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(tags)">
        <NativeTabs.Trigger.Icon
          sf="tag.fill"
          src={
            <NativeTabs.Trigger.VectorIcon
              family={MaterialCommunityIcons}
              name="tag"
            />
          }
        />
        <NativeTabs.Trigger.Label>Tags</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(highlights)">
        <NativeTabs.Trigger.Icon
          sf="highlighter"
          src={
            <NativeTabs.Trigger.VectorIcon
              family={MaterialCommunityIcons}
              name="marker"
            />
          }
        />
        <NativeTabs.Trigger.Label>Highlights</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="(search)"
        hidden={Platform.OS === "android"}
        role={isIOS26 ? "search" : undefined}
      >
        <NativeTabs.Trigger.Icon
          sf="magnifyingglass"
          src={
            <NativeTabs.Trigger.VectorIcon
              family={MaterialCommunityIcons}
              name="magnify"
            />
          }
        />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
