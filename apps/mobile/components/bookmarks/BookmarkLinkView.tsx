import {
  BookmarkLinkArchivePreview,
  BookmarkLinkBrowserPreview,
  BookmarkLinkPdfPreview,
  BookmarkLinkReaderPreview,
  BookmarkLinkScreenshotPreview,
} from "@/components/bookmarks/BookmarkLinkPreview";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import { BookmarkLinkType } from "./BookmarkLinkTypeSelector";

interface BookmarkLinkViewProps {
  bookmark: ZBookmark;
  bookmarkPreviewType: BookmarkLinkType;
  onScrollOffsetChange?: (y: number) => void;
  barsVisible?: boolean;
}

export default function BookmarkLinkView({
  bookmark,
  bookmarkPreviewType,
  onScrollOffsetChange,
  barsVisible,
}: BookmarkLinkViewProps) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    throw new Error("Wrong content type rendered");
  }

  switch (bookmarkPreviewType) {
    case "browser":
      return (
        <BookmarkLinkBrowserPreview
          bookmark={bookmark}
          onScrollOffsetChange={onScrollOffsetChange}
        />
      );
    case "reader":
      return (
        <BookmarkLinkReaderPreview
          bookmark={bookmark}
          onScrollOffsetChange={onScrollOffsetChange}
          barsVisible={barsVisible}
        />
      );
    case "screenshot":
      return <BookmarkLinkScreenshotPreview bookmark={bookmark} />;
    case "archive":
      return (
        <BookmarkLinkArchivePreview
          bookmark={bookmark}
          onScrollOffsetChange={onScrollOffsetChange}
        />
      );
    case "pdf":
      return <BookmarkLinkPdfPreview bookmark={bookmark} />;
  }
}
