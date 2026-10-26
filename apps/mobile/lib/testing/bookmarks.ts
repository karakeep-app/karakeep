import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

function bareBookmark(id: string, createdAt: number) {
  return {
    id,
    createdAt: new Date(createdAt),
    modifiedAt: new Date(createdAt),
    title: `Bookmark ${id}`,
    archived: false,
    favourited: false,
    taggingStatus: null,
    summarizationStatus: null,
    embeddingStatus: null,
    userId: "user",
    tags: [],
    assets: [],
  };
}

export function linkBookmark(
  id: string,
  {
    createdAt = 0,
    htmlContent = `<p>${id}</p>`,
    crawlStatus = "success",
    url = `https://example.com/${id}`,
  }: {
    createdAt?: number;
    htmlContent?: string | null;
    crawlStatus?: "success" | "failure" | "pending";
    url?: string;
  } = {},
): ZBookmark {
  return {
    ...bareBookmark(id, createdAt),
    content: {
      type: BookmarkTypes.LINK,
      url,
      htmlContent,
      crawlStatus,
      crawledAt: new Date(createdAt),
    },
  };
}

export function textBookmark(id: string, createdAt = 0): ZBookmark {
  return {
    ...bareBookmark(id, createdAt),
    content: { type: BookmarkTypes.TEXT, text: `Text ${id}` },
  };
}

export function assetBookmark(id: string, createdAt = 0): ZBookmark {
  return {
    ...bareBookmark(id, createdAt),
    content: {
      type: BookmarkTypes.ASSET,
      assetType: "pdf",
      assetId: `asset-${id}`,
    },
  };
}
