import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";

import { useWhoAmI } from "@karakeep/shared-react/hooks/users";
import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { isBookmarkStillTagging } from "@karakeep/shared/utils/bookmarkUtils";

import { Skeleton } from "../../ui/Skeleton";
import TagPill from "../TagPill";

function TagListSkeleton() {
  return (
    <View className="w-full">
      <Skeleton className="h-[22px] w-16 rounded-full" />
    </View>
  );
}

export default function TagList({
  bookmark,
  maxVisible = 2,
}: {
  bookmark: ZBookmark;
  maxVisible?: number;
}) {
  const { t } = useTranslation();
  const tags = bookmark.tags;
  const { data: currentUser } = useWhoAmI();
  const isOwner = currentUser?.id === bookmark.userId;

  if (isBookmarkStillTagging(bookmark)) {
    return <TagListSkeleton />;
  }

  if (tags.length === 0) {
    return null;
  }

  const hiddenCount = tags.length - maxVisible;

  return (
    <View className="flex-row items-center gap-1.5 overflow-hidden">
      {tags.slice(0, maxVisible).map((tag) => (
        <View key={tag.id} className="shrink">
          <TagPill tag={tag} clickable={isOwner} />
        </View>
      ))}
      {hiddenCount > 0 && (
        <Text
          variant="caption1"
          color="tertiary"
          className="shrink-0"
          accessibilityLabel={t("bookmarks.more_tags_label", {
            count: hiddenCount,
          })}
        >
          +{hiddenCount}
        </Text>
      )}
    </View>
  );
}
