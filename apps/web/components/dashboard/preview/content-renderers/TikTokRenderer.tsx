import { Video } from "lucide-react";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import { ContentRenderer } from "./types";

function extractTikTokVideoId(url: string): string | null {
  const patterns = [
    /tiktok\.com\/@[^/]+\/video\/(\d+)/,
    /tiktok\.com\/t\/([A-Za-z0-9]+)/,
    /vm\.tiktok\.com\/([A-Za-z0-9]+)/,
    /tiktok\.com\/v\/(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function canRenderTikTok(bookmark: ZBookmark): boolean {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return false;
  }

  const url = bookmark.content.url;
  return extractTikTokVideoId(url) !== null;
}

function TikTokRendererComponent({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }

  const videoId = extractTikTokVideoId(bookmark.content.url);
  if (!videoId) {
    return null;
  }

  // TikTok embed URL format
  const embedUrl = `https://www.tiktok.com/embed/v2/${videoId}`;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0 h-full w-full">
        <iframe
          src={embedUrl}
          title="TikTok video"
          className="h-full w-full border-0"
          allow="encrypted-media"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      </div>
    </div>
  );
}

export const tikTokRenderer: ContentRenderer = {
  id: "tiktok",
  name: "TikTok",
  icon: Video,
  canRender: canRenderTikTok,
  component: TikTokRendererComponent,
  priority: 10,
};
