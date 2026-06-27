import { registerWidgetTaskHandler } from "react-native-android-widget";

import { widgetTaskHandler } from "./BookmarkSearchWidgetTask";

export function registerBookmarkSearchWidgetTask() {
  registerWidgetTaskHandler(widgetTaskHandler);
}
