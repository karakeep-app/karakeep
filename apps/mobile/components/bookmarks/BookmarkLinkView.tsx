import {
  BookmarkLinkArchivePreview,
  BookmarkLinkBrowserPreview,
  BookmarkLinkReaderPreview,
  BookmarkLinkScreenshotPreview,
} from "@/components/bookmarks/BookmarkLinkPreview";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

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

  switch (bookmarkPreviewType) {
    case "browser":
      return <BookmarkLinkBrowserPreview bookmark={bookmark} />;
    case "reader":
      return <BookmarkLinkReaderPreview bookmark={bookmark} />;
    case "screenshot":
      return <BookmarkLinkScreenshotPreview bookmark={bookmark} />;
    case "archive":
      return <BookmarkLinkArchivePreview bookmark={bookmark} />;
  }
}
