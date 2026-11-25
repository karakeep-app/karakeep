import { useState } from "react";
import { View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useColorScheme } from "@/lib/useColorScheme";

import { useWhoAmI } from "@karakeep/shared-react/hooks/users";
import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { isBookmarkStillTagging } from "@karakeep/shared/utils/bookmarkUtils";

import { Skeleton } from "../../ui/Skeleton";
import TagPill from "../TagPill";

const FADE_WIDTH = 28;
// Matches --card in globals.css, so the fade blends into the card.
const CARD_COLOR = { light: "rgb(255, 255, 255)", dark: "rgb(28, 28, 30)" };

function TagListSkeleton() {
  return (
    <View className="w-full">
      <Skeleton className="h-[22px] w-16 rounded-full" />
    </View>
  );
}

function EdgeFade({ side }: { side: "left" | "right" }) {
  const { colorScheme } = useColorScheme();
  const color = CARD_COLOR[colorScheme];
  const id = `tagFade-${side}`;
  return (
    <View
      pointerEvents="none"
      className="absolute bottom-0 top-0"
      style={{ width: FADE_WIDTH, [side]: 0 }}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop
              offset="0"
              stopColor={color}
              stopOpacity={side === "left" ? 1 : 0}
            />
            <Stop
              offset="1"
              stopColor={color}
              stopOpacity={side === "left" ? 0 : 1}
            />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

export default function TagList({ bookmark }: { bookmark: ZBookmark }) {
  const tags = bookmark.tags;
  const { data: currentUser } = useWhoAmI();
  const isOwner = currentUser?.id === bookmark.userId;
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);

  if (isBookmarkStillTagging(bookmark)) {
    return <TagListSkeleton />;
  }

  if (tags.length === 0) {
    return null;
  }

  // Fade an edge only while there are more tags past it.
  const showLeftFade = scrollX > 1;
  const showRightFade = contentWidth - viewportWidth - scrollX > 1;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onLayout={(e) => setViewportWidth(e.nativeEvent.layout.width)}
        onContentSizeChange={(width) => setContentWidth(width)}
        onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
        contentContainerStyle={{ alignItems: "center", gap: 6 }}
      >
        {tags.map((tag) => (
          <TagPill key={tag.id} tag={tag} clickable={isOwner} />
        ))}
      </ScrollView>
      {showLeftFade && <EdgeFade side="left" />}
      {showRightFade && <EdgeFade side="right" />}
    </View>
  );
}
