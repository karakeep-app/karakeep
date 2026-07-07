import React from "react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { z } from "zod";
import type {
  WidgetInfo,
  WidgetRepresentation,
  WidgetTaskHandlerProps,
} from "react-native-android-widget";
import type { Settings } from "@/lib/settings";

import {
  DEFAULT_ANDROID_WIDGET_SEARCH_QUERY,
  SETTING_NAME,
  zSettingsSchema,
} from "@/lib/settings";
import { buildApiHeaders } from "@/lib/utils";
import type {
  BookmarkSearchWidgetState,
  WidgetBookmark,
} from "./BookmarkSearchWidget";

import {
  BOOKMARK_SEARCH_WIDGET_NAME,
  BookmarkSearchWidget,
  getBookmarkSearchWidgetItemLimit,
} from "./BookmarkSearchWidget";

const zWidgetBookmark = z.object({
  id: z.string(),
  title: z.string().nullish(),
  tags: z.array(z.object({ name: z.string() })).optional(),
  content: z
    .object({
      type: z.string().optional(),
      url: z.string().nullish(),
      title: z.string().nullish(),
      fileName: z.string().nullish(),
    })
    .optional(),
}) satisfies z.ZodType<WidgetBookmark>;

const zSearchResponse = z.object({
  bookmarks: z.array(zWidgetBookmark).optional(),
});

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
  } catch (error) {
    const errorMessage = getWidgetErrorMessage(error);
    console.error("Karakeep search widget update failed", error);
    return renderWithThemes({
      bookmarks: [],
      errorMessage,
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
    const parsed = zSettingsSchema.safeParse(JSON.parse(rawSettings));
    return parsed.success ? parsed.data : null;
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

  const parsed = zSearchResponse.safeParse(await response.json());
  if (!parsed.success) {
    console.warn("Karakeep search widget received invalid search response");
    return [];
  }
  return parsed.data.bookmarks ?? [];
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

function getWidgetErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Bookmarks unavailable";
}
