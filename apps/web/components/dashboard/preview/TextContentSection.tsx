import Image from "next/image";
import { BookmarkMarkdownComponent } from "@/components/dashboard/bookmarks/BookmarkMarkdownComponent";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { ZBookmarkTypeText } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

export function TextContentSection({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type != BookmarkTypes.TEXT) {
    throw new Error("Invalid content type");
  }
  const banner = bookmark.assets.find(
    (asset) => asset.assetType == "bannerImage",
  );

  return (
    <ScrollArea className="h-full">
      {banner && (
        <div className="relative h-52 min-w-full">
          <Image
            alt="banner"
            src={getAssetUrl(banner.id)}
            width={0}
            height={0}
            unoptimized
            layout="fill"
            objectFit="cover"
          />
        </div>
      )}
      <div className="mx-auto max-w-3xl px-4 py-4">
        <BookmarkMarkdownComponent>
          {bookmark as ZBookmarkTypeText}
        </BookmarkMarkdownComponent>
      </div>
    </ScrollArea>
  );
}
