/** @jsxImportSource react */
"use no memo";

import type { SearchWidgetData } from "./search";
import { createURL } from "expo-linking";
import {
  FlexWidget,
  ListWidget,
  SvgWidget,
  TextWidget,
} from "react-native-android-widget";

export function SearchWidget({
  data,
  dark,
  height,
  width,
}: {
  data: SearchWidgetData;
  dark: boolean;
  height: number;
  width: number;
}) {
  const color = dark ? "#fafafa" : "#18181b";
  const secondary = dark ? "#a1a1aa" : "#52525b";
  return (
    <FlexWidget
      style={{
        width: "match_parent",
        height: "match_parent",
        backgroundColor: dark ? "#18181b" : "#ffffff",
        borderRadius: 16,
        padding: 8,
      }}
    >
      <FlexWidget
        style={{
          flexDirection: "row",
          alignItems: "center",
          width: "match_parent",
          height: 40,
        }}
      >
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget
            text={width < 180 ? "K" : "Karakeep"}
            maxLines={1}
            style={{ color, fontSize: 16, fontWeight: "bold" }}
            clickAction="OPEN_APP"
            accessibilityLabel="Open Karakeep"
          />
        </FlexWidget>
        <TextWidget
          text="⚙"
          allowFontScaling={false}
          style={{
            color: secondary,
            fontSize: 22,
            width: 40,
            height: 40,
            textAlign: "center",
            paddingVertical: 4,
          }}
          clickAction="OPEN_URI"
          clickActionData={{ uri: createURL("/dashboard/settings/widget") }}
          accessibilityLabel="Widget settings"
        />
        <SvgWidget
          svg={`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5"/></svg>`}
          style={{ width: 40, height: 40, padding: 8 }}
          clickAction="REFRESH"
          accessibilityLabel="Refresh bookmarks"
        />
      </FlexWidget>
      {data.message ? (
        <TextWidget
          text={data.message}
          accessibilityLabel={data.message}
          style={{ color: secondary, fontSize: 14, padding: 8 }}
          clickAction="OPEN_APP"
        />
      ) : (
        <ListWidget
          style={{ width: "match_parent", height: Math.max(1, height - 56) }}
        >
          {data.bookmarks.map((bookmark) => (
            <FlexWidget
              key={bookmark.id}
              style={{
                width: "match_parent",
                paddingVertical: 10,
                paddingHorizontal: 4,
              }}
              clickAction="OPEN_URI"
              clickActionData={{
                uri: createURL(
                  `/dashboard/bookmarks/${encodeURIComponent(bookmark.id)}`,
                  { queryParams: { view: "reader" } },
                ),
              }}
              accessibilityLabel={[bookmark.title, bookmark.metadata]
                .filter(Boolean)
                .join(". ")}
            >
              <TextWidget
                text={bookmark.title}
                maxLines={2}
                truncate="END"
                style={{ color, fontSize: 14, fontWeight: "bold" }}
              />
              {bookmark.metadata ? (
                <TextWidget
                  text={bookmark.metadata}
                  maxLines={2}
                  truncate="END"
                  style={{ color: secondary, fontSize: 12, marginTop: 4 }}
                />
              ) : null}
            </FlexWidget>
          ))}
        </ListWidget>
      )}
    </FlexWidget>
  );
}
