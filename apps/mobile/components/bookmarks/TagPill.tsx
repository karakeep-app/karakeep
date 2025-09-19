import { View } from "react-native";
import { Link } from "expo-router";

import { ZBookmarkTags } from "@karakeep/shared/types/tags";

export default function TagPill({ tag }: { tag: ZBookmarkTags }) {
  return (
    <View
      key={tag.id}
      className="rounded-full border border-input px-2.5 py-0.5 text-xs font-semibold"
    >
      <Link className="text-foreground" href={`dashboard/tags/${tag.id}`}>
        {tag.name}
      </Link>
    </View>
  );
}
