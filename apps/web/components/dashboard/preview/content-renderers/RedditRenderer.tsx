import { ExternalLink, MessageSquare } from "lucide-react";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import { ContentRenderer } from "./types";

function extractRedditInfo(
  url: string,
): { subreddit: string; postId: string } | null {
  const patterns = [
    /(?:reddit\.com|old\.reddit\.com)\/r\/([^/]+)\/comments\/([^/]+)/,
    /redd\.it\/([^/]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      if (pattern === patterns[1]) {
        // Short URL only has postId
        return { subreddit: "", postId: match[1] };
      }
      return { subreddit: match[1], postId: match[2] };
    }
  }
  return null;
}

function canRenderReddit(bookmark: ZBookmark): boolean {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return false;
  }
  return extractRedditInfo(bookmark.content.url) !== null;
}

function RedditRendererComponent({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }

  const info = extractRedditInfo(bookmark.content.url);
  if (!info) {
    return null;
  }

  const { title, description, imageUrl, author } = bookmark.content;

  return (
    <div className="relative h-full w-full overflow-auto">
      <div className="mx-auto flex max-w-2xl flex-col p-6">
        {/* Subreddit badge */}
        {info.subreddit && (
          <div className="mb-3">
            <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-700 dark:bg-orange-900 dark:text-orange-200">
              r/{info.subreddit}
            </span>
            {author && (
              <span className="ml-2 text-sm text-muted-foreground">
                by u/{author}
              </span>
            )}
          </div>
        )}

        {/* Post card */}
        <div className="w-full rounded-lg border bg-card p-6 shadow-sm">
          {title && <h2 className="mb-4 text-xl font-semibold">{title}</h2>}

          {imageUrl && (
            <div className="mb-4 w-full">
              {/* oxlint-disable-next-line no-img-element */}
              <img
                src={imageUrl}
                alt={title || "Reddit post"}
                className="h-auto max-h-96 w-full rounded-lg object-contain"
              />
            </div>
          )}

          {description && (
            <p className="mb-4 whitespace-pre-wrap text-sm text-muted-foreground">
              {description}
            </p>
          )}

          <div className="flex gap-3">
            {/* oxlint-disable-next-line no-html-link-for-pages */}
            <a
              href={bookmark.content.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600"
            >
              <ExternalLink size={14} />
              View on Reddit
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export const redditRenderer: ContentRenderer = {
  id: "reddit",
  name: "Reddit",
  icon: MessageSquare,
  canRender: canRenderReddit,
  component: RedditRendererComponent,
  priority: 10,
};
