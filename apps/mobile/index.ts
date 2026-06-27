import "expo-router/entry";

import { Platform } from "react-native";

import { registerBookmarkSearchWidgetTask } from "./widgets/bookmark-search/registerBookmarkSearchWidgetTask";

if (Platform.OS === "android") {
  registerBookmarkSearchWidgetTask();
}
