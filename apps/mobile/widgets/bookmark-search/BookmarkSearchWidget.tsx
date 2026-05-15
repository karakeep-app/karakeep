"use no memo";

import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { WidgetInfo } from "react-native-android-widget";

import { DEFAULT_ANDROID_WIDGET_SEARCH_QUERY } from "@/lib/settings";

export const BOOKMARK_SEARCH_WIDGET_NAME = "BookmarkSearch";

type WidgetTheme = "light" | "dark";

export interface WidgetBookmark {
  id: string;
  title?: string | null;
  tags?: { name: string }[];
  content?: {
    type?: string;
    url?: string | null;
    title?: string | null;
    fileName?: string | null;
  };
}

export interface BookmarkSearchWidgetState {
  bookmarks: WidgetBookmark[];
  query: string;
  scheme: string;
  status: "ready" | "signed-out" | "error";
  errorMessage?: string;
  widgetInfo: WidgetInfo;
}

const palettes = {
  light: {
    background: "#f8fafc",
    card: "#ffffff",
    border: "#d8dee8",
    primary: "#111827",
    secondary: "#475569",
    muted: "#64748b",
    tagBackground: "#e7efff",
    tagText: "#1d4ed8",
  },
  dark: {
    background: "#111827",
    card: "#1f2937",
    border: "#374151",
    primary: "#f8fafc",
    secondary: "#cbd5e1",
    muted: "#94a3b8",
    tagBackground: "#1e3a5f",
    tagText: "#bfdbfe",
  },
} as const;

const WIDGET_SIZE_THRESHOLDS = [
  { minHeight: 330, itemLimit: 6 },
  { minHeight: 270, itemLimit: 5 },
  { minHeight: 220, itemLimit: 4 },
  { minHeight: 170, itemLimit: 3 },
  { minHeight: 130, itemLimit: 2 },
] as const;

export function getBookmarkSearchWidgetItemLimit(widgetInfo: WidgetInfo) {
  for (const { minHeight, itemLimit } of WIDGET_SIZE_THRESHOLDS) {
    if (widgetInfo.height >= minHeight) {
      return itemLimit;
    }
  }
  return 1;
}

export function BookmarkSearchWidget({
  bookmarks,
  errorMessage,
  query,
  scheme,
  status,
  theme,
  widgetInfo,
}: BookmarkSearchWidgetState & { theme: WidgetTheme }) {
  const palette = palettes[theme];
  const safeQuery = query.trim() || DEFAULT_ANDROID_WIDGET_SEARCH_QUERY;
  const visibleBookmarks = bookmarks.slice(
    0,
    getBookmarkSearchWidgetItemLimit(widgetInfo),
  );
  const body =
    status === "signed-out" ? (
      <WidgetMessage message="Sign in to show bookmarks" palette={palette} />
    ) : status === "error" ? (
      <WidgetMessage
        message={errorMessage ?? "Bookmarks unavailable"}
        palette={palette}
      />
    ) : visibleBookmarks.length === 0 ? (
      <WidgetMessage message="No matches" palette={palette} />
    ) : (
      <FlexWidget style={{ flexDirection: "column", flexGap: 6 }}>
        {visibleBookmarks.map((bookmark) => (
          <BookmarkRow
            bookmark={bookmark}
            key={bookmark.id}
            palette={palette}
            scheme={scheme}
          />
        ))}
      </FlexWidget>
    );

  return (
    <FlexWidget
      accessibilityLabel={`Karakeep search widget for ${safeQuery}`}
      style={{
        backgroundColor: palette.background,
        borderColor: palette.border,
        borderRadius: 18,
        borderWidth: 1,
        flexDirection: "column",
        flexGap: 8,
        height: "match_parent",
        overflow: "hidden",
        padding: 12,
        width: "match_parent",
      }}
    >
      <FlexWidget
        style={{
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          width: "match_parent",
        }}
      >
        <TextWidget
          maxLines={1}
          text="Karakeep"
          truncate="END"
          style={{
            color: palette.primary,
            fontSize: 16,
            fontWeight: "700",
          }}
        />
        <TextWidget
          maxLines={1}
          text={safeQuery}
          truncate="END"
          style={{
            color: palette.muted,
            fontSize: 11,
            textAlign: "right",
          }}
        />
      </FlexWidget>
      {body}
    </FlexWidget>
  );
}

function BookmarkRow({
  bookmark,
  palette,
  scheme,
}: {
  bookmark: WidgetBookmark;
  palette: (typeof palettes)[WidgetTheme];
  scheme: string;
}) {
  const title = getBookmarkTitle(bookmark);
  const meta = getBookmarkMeta(bookmark);
  const tags = bookmark.tags?.slice(0, 2).map((tag) => tag.name) ?? [];

  return (
    <FlexWidget
      accessibilityLabel={`Open ${title} in reader mode`}
      clickAction="OPEN_URI"
      clickActionData={{ uri: getReaderUri(scheme, bookmark.id) }}
      style={{
        backgroundColor: palette.card,
        borderColor: palette.border,
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: "column",
        flexGap: 4,
        paddingHorizontal: 10,
        paddingVertical: 8,
        width: "match_parent",
      }}
    >
      <TextWidget
        maxLines={1}
        text={title}
        truncate="END"
        style={{
          color: palette.primary,
          fontSize: 13,
          fontWeight: "600",
        }}
      />
      <FlexWidget
        style={{
          alignItems: "center",
          flexDirection: "row",
          flexGap: 6,
          width: "match_parent",
        }}
      >
        <TextWidget
          maxLines={1}
          text={meta}
          truncate="END"
          style={{
            color: palette.secondary,
            fontSize: 11,
          }}
        />
        {tags.map((tag) => (
          <TextWidget
            key={tag}
            maxLines={1}
            text={`#${tag}`}
            truncate="END"
            style={{
              backgroundColor: palette.tagBackground,
              borderRadius: 8,
              color: palette.tagText,
              fontSize: 10,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          />
        ))}
      </FlexWidget>
    </FlexWidget>
  );
}

function WidgetMessage({
  message,
  palette,
}: {
  message: string;
  palette: (typeof palettes)[WidgetTheme];
}) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        alignItems: "center",
        backgroundColor: palette.card,
        borderColor: palette.border,
        borderRadius: 12,
        borderWidth: 1,
        flex: 1,
        justifyContent: "center",
        padding: 12,
        width: "match_parent",
      }}
    >
      <TextWidget
        maxLines={2}
        text={message}
        truncate="END"
        style={{
          color: palette.secondary,
          fontSize: 13,
          textAlign: "center",
        }}
      />
    </FlexWidget>
  );
}

function getBookmarkTitle(bookmark: WidgetBookmark) {
  return (
    bookmark.title?.trim() ||
    bookmark.content?.title?.trim() ||
    bookmark.content?.fileName?.trim() ||
    "Untitled bookmark"
  );
}

function getBookmarkMeta(bookmark: WidgetBookmark) {
  if (bookmark.content?.type === "link" && bookmark.content.url) {
    return getDomain(bookmark.content.url);
  }
  if (bookmark.content?.type === "asset") {
    return "Asset";
  }
  if (bookmark.content?.type === "text") {
    return "Text";
  }
  return "Bookmark";
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "Link";
  } catch {
    return "Link";
  }
}

function getReaderUri(scheme: string, bookmarkId: string) {
  return `${scheme}://dashboard/bookmarks/${bookmarkId}?view=reader`;
}
