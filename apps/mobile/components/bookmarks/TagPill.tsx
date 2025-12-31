import { Platform, Text, View } from "react-native";
import { Link } from "expo-router";

import { ZBookmarkTags } from "@karakeep/shared/types/tags";

export default function TagPill({
  tag,
  clickable = true,
}: {
  tag: ZBookmarkTags;
  clickable?: boolean;
}) {
  // Trailing space fixes Android text clipping: https://github.com/facebook/react-native/issues/53286
  return (
    <View
      key={tag.id}
      className="rounded-full border border-input px-2.5 py-0.5 text-xs font-semibold"
    >
      {clickable ? (
        <Link className="text-foreground" href={`dashboard/tags/${tag.id}`}>
          {tag.name}
          {Platform.OS === "android" ? " " : ""}
        </Link>
      ) : (
        <Text className="text-foreground">
          {tag.name}
          {Platform.OS === "android" ? " " : ""}
        </Text>
      )}
    </View>
  );
}
