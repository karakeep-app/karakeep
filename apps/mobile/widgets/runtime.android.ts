import type {
  WidgetInfo,
  WidgetRepresentation,
} from "react-native-android-widget";
import type { SearchWidgetData } from "./search";
import { createElement } from "react";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  getWidgetInfo,
  registerWidgetTaskHandler,
  requestWidgetUpdateById,
} from "react-native-android-widget";

import { SETTING_NAME, useSettings, zSettingsSchema } from "../lib/settings";
import { searchWidgetBookmarks, SEARCH_WIDGET_NAME } from "./search";
import { SearchWidget } from "./SearchWidget";

const pending = new Map<number, AbortController>();
const superseded = new Error("Widget update superseded");
let revision = 0;

async function renderSearchWidget(
  info: WidgetInfo,
): Promise<WidgetRepresentation> {
  pending.get(info.widgetId)?.abort();
  const controller = new AbortController();
  pending.set(info.widgetId, controller);
  const currentRevision = revision;
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let theme = "system";
  let data: SearchWidgetData;
  try {
    // Read encrypted storage afresh: Android can run this task without the UI.
    const stored = await SecureStore.getItemAsync(SETTING_NAME);
    const settings = zSettingsSchema.parse(stored ? JSON.parse(stored) : {});
    theme = settings.theme;
    data = await searchWidgetBookmarks(settings, controller.signal);
  } catch {
    data = {
      bookmarks: [],
      message: "Couldn't load bookmarks. Tap refresh to retry.",
    };
  } finally {
    clearTimeout(timeout);
  }
  // A slow response must not restore another account's bookmarks after logout.
  if (
    currentRevision !== revision ||
    pending.get(info.widgetId) !== controller
  ) {
    throw superseded;
  }
  pending.delete(info.widgetId);
  const widget = (dark: boolean) =>
    createElement(SearchWidget, {
      data,
      dark,
      height: info.height,
      width: info.width,
    });
  return {
    light: widget(theme === "dark"),
    dark: widget(theme !== "light"),
  };
}

registerWidgetTaskHandler(
  async ({ widgetInfo, widgetAction, renderWidget }) => {
    if (widgetInfo.widgetName !== SEARCH_WIDGET_NAME) return;
    if (widgetAction === "WIDGET_DELETED") {
      pending.get(widgetInfo.widgetId)?.abort();
      pending.delete(widgetInfo.widgetId);
      return;
    }
    try {
      renderWidget(await renderSearchWidget(widgetInfo));
    } catch (error) {
      if (error !== superseded) console.warn("Unable to update search widget");
    }
  },
);

async function refreshWidgets() {
  const currentRevision = ++revision;
  for (const controller of pending.values()) controller.abort();
  pending.clear();
  try {
    const widgets = await getWidgetInfo(SEARCH_WIDGET_NAME);
    if (currentRevision !== revision) return;
    await Promise.allSettled(
      widgets.map(({ widgetId }) =>
        requestWidgetUpdateById({
          widgetName: SEARCH_WIDGET_NAME,
          widgetId,
          renderWidget: renderSearchWidget,
        }),
      ),
    );
  } catch {
    console.warn("Unable to refresh search widgets");
  }
}

useSettings.subscribe(({ settings }, previous) => {
  if (settings.isLoading) return;
  const before = previous.settings.settings;
  const after = settings.settings;
  if (
    previous.settings.isLoading ||
    before.apiKey !== after.apiKey ||
    before.address !== after.address ||
    before.widgetSearchQuery !== after.widgetSearchQuery ||
    before.theme !== after.theme ||
    before.customHeaders !== after.customHeaders
  ) {
    void refreshWidgets();
  }
});

AppState.addEventListener("change", (state) => {
  if (state === "background") void refreshWidgets();
});
