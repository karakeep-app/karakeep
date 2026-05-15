import React from "react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import type {
  WidgetInfo,
  WidgetRepresentation,
  WidgetTaskHandlerProps,
} from "react-native-android-widget";
import type { Settings } from "@/lib/settings";

import {
  DEFAULT_ANDROID_WIDGET_SEARCH_QUERY,
  SETTING_NAME,
} from "@/lib/settings";
import { buildApiHeaders } from "@/lib/utils";
import type { BookmarkSearchWidgetState } from "./BookmarkSearchWidget";

import {
  BOOKMARK_SEARCH_WIDGET_NAME,
  BookmarkSearchWidget,
  getBookmarkSearchWidgetItemLimit,
} from "./BookmarkSearchWidget";

interface SearchResponse {
  bookmarks?: BookmarkSearchWidgetState["bookmarks"];
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetInfo.widgetName !== BOOKMARK_SEARCH_WIDGET_NAME) {
    return;
  }

  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED":
      props.renderWidget(
        await getBookmarkSearchWidgetRepresentation(props.widgetInfo),
      );
      break;
    default:
      break;
  }
}

export async function getBookmarkSearchWidgetRepresentation(
  widgetInfo: WidgetInfo,
): Promise<WidgetRepresentation> {
  const settings = await loadSettings();
  const query =
    settings?.androidWidgetSearchQuery?.trim() ||
    DEFAULT_ANDROID_WIDGET_SEARCH_QUERY;

  if (!settings?.apiKey) {
    return renderWithThemes({
      bookmarks: [],
      query,
      scheme: getBookmarkSearchWidgetScheme(),
      status: "signed-out",
      widgetInfo,
    });
  }

  try {
    const bookmarks = await fetchBookmarks(settings, query, widgetInfo);
    return renderWithThemes({
      bookmarks,
      query,
      scheme: getBookmarkSearchWidgetScheme(),
      status: "ready",
      widgetInfo,
    });
  } catch {
    return renderWithThemes({
      bookmarks: [],
      errorMessage: "Bookmarks unavailable",
      query,
      scheme: getBookmarkSearchWidgetScheme(),
      status: "error",
      widgetInfo,
    });
  }
}

async function loadSettings(): Promise<Settings | null> {
  try {
    const rawSettings = await SecureStore.getItemAsync(SETTING_NAME);
    if (!rawSettings) {
      return null;
    }
    return JSON.parse(rawSettings) as Settings;
  } catch {
    return null;
  }
}

async function fetchBookmarks(
  settings: Settings,
  query: string,
  widgetInfo: WidgetInfo,
) {
  const address = (settings.address ?? "https://cloud.karakeep.app").replace(
    /\/+$/,
    "",
  );
  const params = new URLSearchParams({
    includeContent: "false",
    limit: `${getBookmarkSearchWidgetItemLimit(widgetInfo)}`,
    q: query,
  });
  const response = await fetch(`${address}/api/v1/bookmarks/search?${params}`, {
    headers: buildApiHeaders(settings.apiKey, settings.customHeaders),
  });

  if (!response.ok) {
    throw new Error(`Search request failed with ${response.status}`);
  }

  const data = (await response.json()) as SearchResponse;
  return Array.isArray(data.bookmarks) ? data.bookmarks : [];
}

function renderWithThemes(
  props: Omit<BookmarkSearchWidgetState, "widgetInfo"> & {
    widgetInfo: WidgetInfo;
  },
) {
  return {
    light: <BookmarkSearchWidget {...props} theme="light" />,
    dark: <BookmarkSearchWidget {...props} theme="dark" />,
  };
}

export function getBookmarkSearchWidgetScheme() {
  const scheme = Constants.expoConfig?.scheme;
  if (Array.isArray(scheme)) {
    return scheme[0] ?? "karakeep";
  }
  return scheme ?? "karakeep";
}
