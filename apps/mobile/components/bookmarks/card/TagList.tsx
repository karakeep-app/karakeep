import { ScrollView, View } from "react-native";

import { useWhoAmI } from "@karakeep/shared-react/hooks/users";
import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { isBookmarkStillTagging } from "@karakeep/shared/utils/bookmarkUtils";

import { Skeleton } from "../../ui/Skeleton";
import TagPill from "../TagPill";

export default function TagList({ bookmark }: { bookmark: ZBookmark }) {
  const tags = bookmark.tags;
  const { data: currentUser } = useWhoAmI();
  const isOwner = currentUser?.id === bookmark.userId;

  if (isBookmarkStillTagging(bookmark)) {
    return (
      <>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="flex flex-row gap-2">
        {tags.map((t) => (
          <TagPill key={t.id} tag={t} clickable={isOwner} />
        ))}
      </View>
    </ScrollView>
  );
}
