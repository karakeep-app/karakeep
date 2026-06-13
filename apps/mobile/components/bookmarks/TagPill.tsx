import { Text, View } from "react-native";
import { Link } from "expo-router";
import { useColorScheme } from "@/lib/useColorScheme";

import { ZBookmarkTags } from "@karakeep/shared/types/tags";

const TAG_PILL_COLORS = {
  light: {
    backgroundColor: "hsl(210, 40%, 96.1%)",
    color: "rgb(55, 65, 81)",
  },
  dark: {
    backgroundColor: "rgb(40, 40, 40)",
    color: "rgb(156, 163, 175)",
  },
};

export default function TagPill({
  tag,
  clickable = true,
}: {
  tag: ZBookmarkTags;
  clickable?: boolean;
}) {
  const { isDarkColorScheme } = useColorScheme();
  const colors = isDarkColorScheme
    ? TAG_PILL_COLORS.dark
    : TAG_PILL_COLORS.light;

  return (
    <View
      key={tag.id}
      className="h-[22px] flex-row items-center rounded-full border border-transparent px-2.5"
      style={{ backgroundColor: colors.backgroundColor }}
    >
      {clickable ? (
        <Link
          className="text-xs font-light"
          numberOfLines={1}
          style={{ color: colors.color }}
          href={`dashboard/tags/${tag.id}`}
        >
          {tag.name}
        </Link>
      ) : (
        <Text
          className="text-xs font-light"
          numberOfLines={1}
          style={{ color: colors.color }}
        >
          {tag.name}
        </Text>
      )}
    </View>
  );
}
