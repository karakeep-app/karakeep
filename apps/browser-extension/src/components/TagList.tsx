import { useAutoRefreshingBookmarkQuery } from "@karakeep/shared-react/hooks/bookmarks";
import { isBookmarkStillTagging } from "@karakeep/shared/utils/bookmarkUtils";

import { Badge } from "./ui/badge";

export default function TagList({ bookmarkId }: { bookmarkId: string }) {
  const { data: bookmark } = useAutoRefreshingBookmarkQuery({ bookmarkId });
  if (!bookmark) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {bookmark.tags.length === 0 && !isBookmarkStillTagging(bookmark) && (
        <Badge variant="secondary">No tags</Badge>
      )}
      {[...bookmark.tags]
        .sort((a, b) =>
          a.attachedBy === "ai" ? 1 : b.attachedBy === "ai" ? -1 : 0,
        )
        .map((tag) => (
          <Badge
            key={tag.id}
            className={
              tag.attachedBy === "ai" ? "bg-purple-500 text-white" : undefined
            }
          >
            {tag.name}
          </Badge>
        ))}
      {isBookmarkStillTagging(bookmark) && (
        <Badge variant="secondary">AI tags loading...</Badge>
      )}
    </div>
  );
}
