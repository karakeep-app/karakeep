import { ExternalLink, Newspaper } from "lucide-react";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import { ContentRenderer } from "./types";

function extractHNInfo(url: string): { itemId: string } | null {
  const match = url.match(/news\.ycombinator\.com\/item\?id=(\d+)/);
  if (match) {
    return { itemId: match[1] };
  }
  return null;
}

function canRenderHN(bookmark: ZBookmark): boolean {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return false;
  }
  return extractHNInfo(bookmark.content.url) !== null;
}

function HackerNewsRendererComponent({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }

  const info = extractHNInfo(bookmark.content.url);
  if (!info) {
    return null;
  }

  const { title, description } = bookmark.content;

  return (
    <div className="relative h-full w-full overflow-auto">
      <div className="mx-auto flex max-w-2xl flex-col p-6">
        {/* Badge */}
        <div className="mb-3">
          <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-700 dark:bg-orange-900 dark:text-orange-200">
            Hacker News
          </span>
        </div>

        {/* Item card */}
        <div className="w-full rounded-lg border bg-card p-6 shadow-sm">
          {title && <h2 className="mb-4 text-xl font-semibold">{title}</h2>}

          {description && (
            <p className="mb-4 text-sm text-muted-foreground">{description}</p>
          )}

          <div className="flex gap-3">
            {/* oxlint-disable-next-line no-html-link-for-pages */}
            <a
              href={bookmark.content.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md bg-[#FF6600] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#E55B00]"
            >
              <ExternalLink size={14} />
              View on Hacker News
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export const hackerNewsRenderer: ContentRenderer = {
  id: "hackernews",
  name: "Hacker News",
  icon: Newspaper,
  canRender: canRenderHN,
  component: HackerNewsRendererComponent,
  priority: 10,
};
