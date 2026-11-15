import { Video } from "lucide-react";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import { ContentRenderer } from "./types";

function extractTikTokVideoId(url: string): string | null {
  // Only numeric video ids work with the embed player. Share links
  // (vm.tiktok.com/<code>, tiktok.com/t/<code>) carry a share code, not a
  // video id: passing it to /embed/v2/ shows "Video currently unavailable".
  // Those links now fall back to the default preview. Some share links
  // redirect to tiktok.com/@/video/<id> with an empty user name, hence `*`.
  const patterns = [
    /tiktok\.com\/@[^/]*\/video\/(\d+)/,
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
