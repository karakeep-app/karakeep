import { ExternalLink, HelpCircle } from "lucide-react";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import { ContentRenderer } from "./types";

function extractStackOverflowInfo(url: string): { questionId: string } | null {
  const patterns = [
    /stackoverflow\.com\/questions\/(\d+)/,
    /stackoverflow\.com\/q\/(\d+)/,
    /stackexchange\.com\/questions\/(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return { questionId: match[1] };
    }
  }
  return null;
}

function canRenderStackOverflow(bookmark: ZBookmark): boolean {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return false;
  }
  return extractStackOverflowInfo(bookmark.content.url) !== null;
}

function StackOverflowRendererComponent({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }

  const info = extractStackOverflowInfo(bookmark.content.url);
  if (!info) {
    return null;
  }

  const { title, description } = bookmark.content;

  return (
    <div className="relative h-full w-full overflow-auto">
      <div className="mx-auto flex max-w-2xl flex-col p-6">
        {/* Badge */}
        <div className="mb-3">
          <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-800 dark:bg-orange-900 dark:text-orange-200">
            Stack Overflow
          </span>
        </div>

        {/* Question card */}
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
              className="flex items-center gap-2 rounded-md bg-[#F48024] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#DA7220]"
            >
              <ExternalLink size={14} />
              View on Stack Overflow
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export const stackOverflowRenderer: ContentRenderer = {
  id: "stackoverflow",
  name: "Stack Overflow",
  icon: HelpCircle,
  canRender: canRenderStackOverflow,
  component: StackOverflowRendererComponent,
  priority: 10,
};
