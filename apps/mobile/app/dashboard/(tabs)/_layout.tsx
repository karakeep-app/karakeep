import React from "react";
import { Platform } from "react-native";
import {
  Icon,
  Label,
  NativeTabs,
  VectorIcon,
} from "expo-router/unstable-native-tabs";
import { isIOS26 } from "@/lib/ios";
import { useColorScheme } from "@/lib/useColorScheme";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

export default function TabLayout() {
  const { colors } = useColorScheme();
  return (
    <NativeTabs
      backgroundColor={colors.grey6}
      minimizeBehavior="onScrollDown"
      labelVisibilityMode={Platform.select({ android: "labeled" })}
    >
      <NativeTabs.Trigger name="(home)">
        <Icon
          sf="house.fill"
          androidSrc={
            <VectorIcon family={MaterialCommunityIcons} name="home" />
          }
        />
        <Label>Home</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(lists)">
        <Icon
          sf="list.clipboard.fill"
          androidSrc={
            <VectorIcon family={MaterialCommunityIcons} name="clipboard-list" />
          }
        />
        <Label>Lists</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(tags)">
        <Icon
          sf="tag.fill"
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="tag" />}
        />
        <Label>Tags</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(highlights)">
        <Icon
          sf="highlighter"
          androidSrc={
            <VectorIcon family={MaterialCommunityIcons} name="marker" />
          }
        />
        <Label>Highlights</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="(search)"
        hidden={Platform.OS === "android"}
        role={isIOS26 ? "search" : undefined}
      >
        <Icon
          sf="magnifyingglass"
          androidSrc={
            <VectorIcon family={MaterialCommunityIcons} name="magnify" />
          }
        />
        <Label>Search</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
