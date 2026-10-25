import { Sparkles } from "lucide-react";

import { useAutoRefreshingBookmarkQuery } from "@karakeep/shared-react/hooks/bookmarks";
import { isBookmarkStillTagging } from "@karakeep/shared/utils/bookmarkUtils";

import Spinner from "../Spinner";
import { Badge } from "./ui/badge";

export default function TagList({ bookmarkId }: { bookmarkId: string }) {
  const { data: bookmark } = useAutoRefreshingBookmarkQuery({ bookmarkId });
  if (!bookmark) {
    return null;
  }

  return (
    <>
      {[...bookmark.tags].map((tag) =>
        tag.attachedBy === "ai" ? (
          <Badge
            key={tag.id}
            variant="outline"
            className="h-7 gap-1 border-purple-200 bg-purple-50 font-medium text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300"
            title="Added by AI"
          >
            <Sparkles className="size-3" />
            {tag.name}
          </Badge>
        ) : (
          <Badge
            key={tag.id}
            variant="secondary"
            className="h-7 font-medium dark:bg-input"
          >
            {tag.name}
          </Badge>
        ),
      )}
      {isBookmarkStillTagging(bookmark) && (
        <Badge
          variant="outline"
          className="h-7 gap-1.5 font-normal text-muted-foreground"
        >
          <Spinner className="size-3" />
          AI tagging…
        </Badge>
      )}
    </>
  );
}
