import { api } from "@/lib/trpc";
import { BookmarksLayoutTypes } from "@/lib/userLocalSettings/types";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getBookmarkRefreshInterval } from "@karakeep/shared/utils/bookmarkUtils";

import AssetCard from "./AssetCard";
import LinkCard from "./LinkCard";
import TextCard from "./TextCard";
import UnknownCard from "./UnknownCard";

export default function BookmarkCard({
  bookmark: initialData,
  fixedLayout,
  className,
}: {
  bookmark: ZBookmark;
  fixedLayout?: BookmarksLayoutTypes;
  className?: string;
}) {
  const { data: bookmark } = api.bookmarks.getBookmark.useQuery(
    {
      bookmarkId: initialData.id,
    },
    {
      initialData,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) {
          return false;
        }
        return getBookmarkRefreshInterval(data);
      },
    },
  );

  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      return (
        <LinkCard
          className={className}
          fixedLayout={fixedLayout}
          bookmark={{ ...bookmark, content: bookmark.content }}
        />
      );
    case BookmarkTypes.TEXT:
      return (
        <TextCard
          className={className}
          fixedLayout={fixedLayout}
          bookmark={{ ...bookmark, content: bookmark.content }}
        />
      );
    case BookmarkTypes.ASSET:
      return (
        <AssetCard
          className={className}
          fixedLayout={fixedLayout}
          bookmark={{ ...bookmark, content: bookmark.content }}
        />
      );
    case BookmarkTypes.UNKNOWN:
      return (
        <UnknownCard
          className={className}
          fixedLayout={fixedLayout}
          bookmark={bookmark}
        />
      );
  }
}
