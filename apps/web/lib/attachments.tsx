import {
  Archive,
  Camera,
  FileCode,
  Image,
  Paperclip,
  Upload,
  Video,
} from "lucide-react";

import { ZAssetType } from "@karakeep/shared/types/bookmarks";

export const ASSET_TYPE_TO_ICON: Record<ZAssetType, React.ReactNode> = {
  screenshot: <Camera className="size-4" />,
  assetScreenshot: <Camera className="size-4" />,
  fullPageArchive: <Archive className="size-4" />,
  precrawledArchive: <Archive className="size-4" />,
  bannerImage: <Image className="size-4" />,
  video: <Video className="size-4" />,
  bookmarkAsset: <Paperclip className="size-4" />,
  linkHtmlContent: <FileCode className="size-4" />,
  userUploaded: <Upload className="size-4" />,
  unknown: <Paperclip className="size-4" />,
};
