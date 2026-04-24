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
  contentInsetTop?: number;
  contentInsetBottom?: number;
}

export default function BookmarkLinkView({
  bookmark,
  bookmarkPreviewType,
  onScrollOffsetChange,
  barsVisible,
  contentInsetTop,
  contentInsetBottom,
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
          contentInsetTop={contentInsetTop}
          contentInsetBottom={contentInsetBottom}
        />
      );
    case "reader":
      return (
        <BookmarkLinkReaderPreview
          bookmark={bookmark}
          onScrollOffsetChange={onScrollOffsetChange}
          barsVisible={barsVisible}
          contentInsetBottom={contentInsetBottom}
        />
      );
    case "screenshot":
      return <BookmarkLinkScreenshotPreview bookmark={bookmark} />;
    case "archive":
      return (
        <BookmarkLinkArchivePreview
          bookmark={bookmark}
          onScrollOffsetChange={onScrollOffsetChange}
          contentInsetTop={contentInsetTop}
          contentInsetBottom={contentInsetBottom}
        />
      );
    case "pdf":
      return <BookmarkLinkPdfPreview bookmark={bookmark} />;
  }
}
