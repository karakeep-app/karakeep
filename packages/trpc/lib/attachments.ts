import { z } from "zod";

import { AssetTypes } from "@karakeep/db/schema";
import {
  ZAssetType,
  zAssetTypesSchema,
} from "@karakeep/shared/types/bookmarks";

export function mapDBAssetTypeToUserType(assetType: AssetTypes): ZAssetType {
  const map: Record<AssetTypes, z.infer<typeof zAssetTypesSchema>> = {
    [AssetTypes.LINK_SCREENSHOT]: "screenshot",
    [AssetTypes.ASSET_SCREENSHOT]: "assetScreenshot",
    [AssetTypes.LINK_FULL_PAGE_ARCHIVE]: "fullPageArchive",
    [AssetTypes.LINK_PRECRAWLED_ARCHIVE]: "precrawledArchive",
    [AssetTypes.LINK_BANNER_IMAGE]: "bannerImage",
    [AssetTypes.LINK_VIDEO]: "video",
    [AssetTypes.LINK_HTML_CONTENT]: "linkHtmlContent",
    [AssetTypes.BOOKMARK_ASSET]: "bookmarkAsset",
    [AssetTypes.UNKNOWN]: "bannerImage",
  };
  return map[assetType];
}

export function mapSchemaAssetTypeToDB(
  assetType: z.infer<typeof zAssetTypesSchema>,
): AssetTypes {
  const map: Record<ZAssetType, AssetTypes> = {
    screenshot: AssetTypes.LINK_SCREENSHOT,
    assetScreenshot: AssetTypes.ASSET_SCREENSHOT,
    fullPageArchive: AssetTypes.LINK_FULL_PAGE_ARCHIVE,
    precrawledArchive: AssetTypes.LINK_PRECRAWLED_ARCHIVE,
    bannerImage: AssetTypes.LINK_BANNER_IMAGE,
    video: AssetTypes.LINK_VIDEO,
    bookmarkAsset: AssetTypes.BOOKMARK_ASSET,
    linkHtmlContent: AssetTypes.LINK_HTML_CONTENT,
    unknown: AssetTypes.UNKNOWN,
  };
  return map[assetType];
}

export function humanFriendlyNameForAssertType(type: ZAssetType) {
  const map: Record<ZAssetType, string> = {
    screenshot: "Screenshot",
    assetScreenshot: "Asset Screenshot",
    fullPageArchive: "Full Page Archive",
    precrawledArchive: "Precrawled Archive",
    bannerImage: "Banner Image",
    video: "Video",
    bookmarkAsset: "Bookmark Asset",
    linkHtmlContent: "HTML Content",
    unknown: "Unknown",
  };
  return map[type];
}

export function isAllowedToAttachAsset(type: ZAssetType) {
  const map: Record<ZAssetType, boolean> = {
    screenshot: true,
    assetScreenshot: true,
    fullPageArchive: false,
    precrawledArchive: true,
    bannerImage: true,
    video: true,
    bookmarkAsset: false,
    linkHtmlContent: false,
    unknown: false,
  };
  return map[type];
}

export function isAllowedToDetachAsset(type: ZAssetType) {
  const map: Record<ZAssetType, boolean> = {
    screenshot: true,
    assetScreenshot: true,
    fullPageArchive: true,
    precrawledArchive: true,
    bannerImage: true,
    video: true,
    bookmarkAsset: false,
    linkHtmlContent: false,
    unknown: false,
  };
  return map[type];
}
