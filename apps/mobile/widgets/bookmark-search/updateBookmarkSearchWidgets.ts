import { requestWidgetUpdate } from "react-native-android-widget";

import { BOOKMARK_SEARCH_WIDGET_NAME } from "./BookmarkSearchWidget";
import { getBookmarkSearchWidgetRepresentation } from "./BookmarkSearchWidgetTask";

export function updateBookmarkSearchWidgets() {
  return requestWidgetUpdate({
    widgetName: BOOKMARK_SEARCH_WIDGET_NAME,
    renderWidget: getBookmarkSearchWidgetRepresentation,
  });
}
