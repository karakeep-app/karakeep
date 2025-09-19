import { ViewStyle } from "react-native";
import { Tabs } from "expo-router";
import { cssInterop } from "nativewind";

function StyledTabsImpl({
  tabBarStyle,
  headerStyle,
  sceneStyle,
  ...props
}: React.ComponentProps<typeof Tabs> & {
  tabBarStyle?: ViewStyle;
  headerStyle?: ViewStyle;
  sceneStyle?: ViewStyle;
}) {
  props.screenOptions = {
    ...props.screenOptions,
    tabBarStyle,
    headerStyle,
    sceneStyle,
  };
  return <Tabs {...props} />;
}

export const StyledTabs = cssInterop(StyledTabsImpl, {
  tabBarClassName: "tabBarStyle",
  headerClassName: "headerStyle",
  sceneClassName: "sceneStyle",
});
