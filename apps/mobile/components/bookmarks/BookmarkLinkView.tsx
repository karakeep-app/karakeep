import BookmarkContentLoading from "@/components/bookmarks/BookmarkContentLoading";
import {
  BookmarkLinkArchivePreview,
  BookmarkLinkBrowserPreview,
  BookmarkLinkPdfPreview,
  BookmarkLinkReaderPreview,
  BookmarkLinkScreenshotPreview,
} from "@/components/bookmarks/BookmarkLinkPreview";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { isBookmarkStillCrawling } from "@karakeep/shared/utils/bookmarkUtils";

import { BookmarkLinkType } from "./BookmarkLinkTypeSelector";

interface BookmarkLinkViewProps {
  bookmark: ZBookmark;
  bookmarkPreviewType: BookmarkLinkType;
}

export default function BookmarkLinkView({
  bookmark,
  bookmarkPreviewType,
}: BookmarkLinkViewProps) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    throw new Error("Wrong content type rendered");
  }

  // Every view but the browser one renders crawled content, so there's nothing
  // to show until the crawl is done.
  if (bookmarkPreviewType !== "browser" && isBookmarkStillCrawling(bookmark)) {
    return <BookmarkContentLoading />;
  }

  switch (bookmarkPreviewType) {
    case "browser":
      return <BookmarkLinkBrowserPreview bookmark={bookmark} />;
    case "reader":
      return <BookmarkLinkReaderPreview bookmark={bookmark} />;
    case "screenshot":
      return <BookmarkLinkScreenshotPreview bookmark={bookmark} />;
    case "archive":
      return <BookmarkLinkArchivePreview bookmark={bookmark} />;
    case "pdf":
      return <BookmarkLinkPdfPreview bookmark={bookmark} />;
  }
}
