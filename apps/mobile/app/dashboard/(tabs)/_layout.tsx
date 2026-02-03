import React from "react";
import {
  Icon,
  Label,
  NativeTabs,
  VectorIcon,
} from "expo-router/unstable-native-tabs";
import { useColorScheme } from "@/lib/useColorScheme";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

export default function TabLayout() {
  const { colors } = useColorScheme();
  return (
    <NativeTabs backgroundColor={colors.grey6} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <Icon
          sf="house.fill"
          androidSrc={
            <VectorIcon family={MaterialCommunityIcons} name="home" />
          }
        />
        <Label>Home</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="lists">
        <Icon
          sf="list.clipboard.fill"
          androidSrc={
            <VectorIcon family={MaterialCommunityIcons} name="clipboard-list" />
          }
        />
        <Label>Lists</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="tags">
        <Icon
          sf="tag.fill"
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="tag" />}
        />
        <Label>Tags</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="highlights">
        <Icon
          sf="highlighter"
          androidSrc={
            <VectorIcon family={MaterialCommunityIcons} name="marker" />
          }
        />
        <Label>Highlights</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <Icon
          sf="gearshape.fill"
          androidSrc={<VectorIcon family={MaterialCommunityIcons} name="cog" />}
        />
        <Label>Settings</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
