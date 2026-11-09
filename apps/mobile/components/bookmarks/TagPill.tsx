import { Pressable, View } from "react-native";
import { Link } from "expo-router";
import { Text } from "@/components/ui/Text";

import { ZBookmarkTags } from "@karakeep/shared/types/tags";

export default function TagPill({
  tag,
  clickable = true,
}: {
  tag: ZBookmarkTags;
  clickable?: boolean;
}) {
  const pill = (
    <View className="h-[22px] flex-row items-center rounded-full bg-background px-2.5 dark:bg-muted/25">
      <Text
        variant="caption1"
        className="text-muted-foreground dark:text-foreground/80"
        numberOfLines={1}
      >
        {tag.name}
      </Text>
    </View>
  );

  if (!clickable) {
    return pill;
  }

  return (
    <Link asChild href={`dashboard/tags/${tag.id}`}>
      <Pressable accessibilityRole="link" className="active:opacity-60">
        {pill}
      </Pressable>
    </Link>
  );
}
