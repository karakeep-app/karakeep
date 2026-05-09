import { useSession } from "@/lib/auth/client";
import { useReaderSettings } from "@/lib/readerSettings";
import { Archive, Images } from "lucide-react";

import {
  BookmarkTypes,
  ZBookmark,
  ZBookmarkedLink,
} from "@karakeep/shared/types/bookmarks";
import { READER_FONT_FAMILIES } from "@karakeep/shared/types/readers";

import ReaderView from "../ReaderView";
import { ContentRenderer } from "./types";

const PLATFORM_LABELS: Record<string, string> = {
  wechat: "WeChat",
  x: "X",
};

function getPlatformLabel(platform: string | null | undefined) {
  if (!platform) {
    return null;
  }
  return PLATFORM_LABELS[platform] ?? platform;
}

function getImageCount(link: ZBookmarkedLink) {
  const imageList = link.rawExtraction?.imageList;
  return Array.isArray(imageList) ? imageList.length : null;
}

function canRenderPlatformCapture(bookmark: ZBookmark): boolean {
  return (
    bookmark.content.type === BookmarkTypes.LINK && !!bookmark.content.platform
  );
}

function PlatformCaptureRendererComponent({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  const { data: session } = useSession();
  const { settings } = useReaderSettings();

  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }

  const link = bookmark.content;
  const platformLabel = getPlatformLabel(link.platform);
  const imageCount = getImageCount(link);
  const isOwner = session?.user?.id === bookmark.userId;

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-2 border-b bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Archive className="h-4 w-4 shrink-0" />
            <span>{platformLabel} capture</span>
            {link.adapterVersion && (
              <span className="text-xs text-muted-foreground">
                {link.adapterVersion}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {link.author && <span>{link.author}</span>}
            {link.publisher && link.publisher !== link.author && (
              <span>{link.publisher}</span>
            )}
            {link.datePublished && (
              <time dateTime={link.datePublished.toISOString()}>
                {link.datePublished.toLocaleDateString()}
              </time>
            )}
          </div>
        </div>
        {imageCount !== null && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Images className="h-3.5 w-3.5" />
            <span>{imageCount}</span>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-6">
        <ReaderView
          className="mx-auto max-w-3xl"
          style={{
            fontFamily: READER_FONT_FAMILIES[settings.fontFamily],
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
          }}
          bookmarkId={bookmark.id}
          readOnly={!isOwner}
          progressBarStyle={{ top: 0 }}
        />
      </div>
    </div>
  );
}

export const platformCaptureRenderer: ContentRenderer = {
  id: "platform-capture",
  name: "Platform Capture",
  icon: Archive,
  canRender: canRenderPlatformCapture,
  component: PlatformCaptureRendererComponent,
  priority: 30,
};
