import { Instagram } from "lucide-react";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import { ContentRenderer } from "./types";

type InstagramMediaType = "p" | "reel" | "reels" | "tv";

function extractInstagramMedia(
  url: string,
): { type: InstagramMediaType; shortcode: string } | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  if (!/(^|\.)instagram\.com$/.test(parsedUrl.hostname)) {
    return null;
  }

  const [type, shortcode] = parsedUrl.pathname.split("/").filter(Boolean) as [
    InstagramMediaType | undefined,
    string | undefined,
  ];

  if (
    (type === "p" || type === "reel" || type === "reels" || type === "tv") &&
    shortcode
  ) {
    return { type, shortcode };
  }

  return null;
}

function canRenderInstagram(bookmark: ZBookmark): boolean {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return false;
  }

  return extractInstagramMedia(bookmark.content.url) !== null;
}

function InstagramRendererComponent({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }

  const media = extractInstagramMedia(bookmark.content.url);
  if (!media) {
    return null;
  }

  const mediaType = media.type === "reels" ? "reel" : media.type;
  const embedUrl = `https://www.instagram.com/${mediaType}/${media.shortcode}/embed/captioned`;

  return (
    <div className="h-full w-full overflow-auto bg-background p-4">
      <iframe
        src={embedUrl}
        title="Instagram post"
        className="mx-auto h-full min-h-[700px] w-full max-w-[540px] rounded-md border-0"
        allow="web-share"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      />
    </div>
  );
}

export const instagramRenderer: ContentRenderer = {
  id: "instagram",
  name: "Instagram",
  icon: Instagram,
  canRender: canRenderInstagram,
  component: InstagramRendererComponent,
  priority: 10,
};
