import type { ZAssetType } from "../types/bookmarks";

export function getAssetUrl(assetId: string) {
  return `/api/assets/${assetId}`;
}

export function humanFriendlyNameForAssertType(type: ZAssetType) {
  const map: Record<ZAssetType, string> = {
    screenshot: "Screenshot",
    pdf: "PDF",
    assetScreenshot: "Asset Screenshot",
    fullPageArchive: "Full Page Archive",
    precrawledArchive: "Precrawled Archive",
    bannerImage: "Banner Image",
    video: "Video",
    bookmarkAsset: "Bookmark Asset",
    linkHtmlContent: "HTML Content",
    userUploaded: "User Uploaded File",
    avatar: "Avatar",
    unknown: "Unknown",
  };
  return map[type];
}
