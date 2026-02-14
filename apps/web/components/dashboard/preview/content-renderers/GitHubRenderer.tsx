import { ExternalLink, GitBranch } from "lucide-react";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import { ContentRenderer } from "./types";

type GitHubUrlInfo =
  | { type: "repo"; owner: string; repo: string }
  | { type: "issue"; owner: string; repo: string; number: string }
  | { type: "pull"; owner: string; repo: string; number: string };

function extractGitHubInfo(url: string): GitHubUrlInfo | null {
  // Issues
  const issueMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (issueMatch) {
    return {
      type: "issue",
      owner: issueMatch[1],
      repo: issueMatch[2],
      number: issueMatch[3],
    };
  }

  // Pull requests
  const prMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (prMatch) {
    return {
      type: "pull",
      owner: prMatch[1],
      repo: prMatch[2],
      number: prMatch[3],
    };
  }

  // Repository (must come last since it's more general)
  const repoMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/?(?:\?|#|$)/);
  if (repoMatch) {
    return { type: "repo", owner: repoMatch[1], repo: repoMatch[2] };
  }

  return null;
}

function canRenderGitHub(bookmark: ZBookmark): boolean {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return false;
  }
  return extractGitHubInfo(bookmark.content.url) !== null;
}

function GitHubRendererComponent({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }

  const info = extractGitHubInfo(bookmark.content.url);
  if (!info) {
    return null;
  }

  const { title, description, imageUrl } = bookmark.content;

  const label =
    info.type === "issue"
      ? `Issue #${info.number}`
      : info.type === "pull"
        ? `Pull Request #${info.number}`
        : "Repository";

  return (
    <div className="relative h-full w-full overflow-auto">
      <div className="mx-auto flex max-w-2xl flex-col p-6">
        {/* Header badge */}
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
            {info.owner}/{info.repo}
          </span>
          <span className="rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900 dark:text-purple-200">
            {label}
          </span>
        </div>

        {/* Card */}
        <div className="w-full rounded-lg border bg-card p-6 shadow-sm">
          {/* OG Image (GitHub generates social preview images) */}
          {imageUrl && (
            <div className="mb-4 w-full">
              {/* oxlint-disable-next-line no-img-element */}
              <img
                src={imageUrl}
                alt={title || "GitHub"}
                className="h-auto w-full rounded-lg object-contain"
              />
            </div>
          )}

          {title && <h2 className="mb-3 text-xl font-semibold">{title}</h2>}

          {description && (
            <p className="mb-4 text-sm text-muted-foreground">{description}</p>
          )}

          <div className="flex gap-3">
            {/* oxlint-disable-next-line no-html-link-for-pages */}
            <a
              href={bookmark.content.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              <ExternalLink size={14} />
              View on GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export const gitHubRenderer: ContentRenderer = {
  id: "github",
  name: "GitHub",
  icon: GitBranch,
  canRender: canRenderGitHub,
  component: GitHubRendererComponent,
  priority: 10,
};
