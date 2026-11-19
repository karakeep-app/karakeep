import { z } from "zod";

export const enum ASSET_TYPES {
  IMAGE_GIF = "image/gif",
  IMAGE_JPEG = "image/jpeg",
  IMAGE_PNG = "image/png",
  IMAGE_WEBP = "image/webp",
  APPLICATION_PDF = "application/pdf",
  APPLICATION_ZIP = "application/zip",
  TEXT_HTML = "text/html",

  VIDEO_MP4 = "video/mp4",
  VIDEO_WEBM = "video/webm",
  VIDEO_MKV = "video/x-matroska",

  AUDIO_MPEG = "audio/mpeg",
  AUDIO_WAV = "audio/wav",
  AUDIO_OGG = "audio/ogg",
  AUDIO_AAC = "audio/aac",
  AUDIO_FLAC = "audio/flac",
}

export const VIDEO_ASSET_TYPES: Set<string> = new Set<string>([
  ASSET_TYPES.VIDEO_MP4,
  ASSET_TYPES.VIDEO_WEBM,
  ASSET_TYPES.VIDEO_MKV,
]);

export const IMAGE_ASSET_TYPES: Set<string> = new Set<string>([
  ASSET_TYPES.IMAGE_GIF,
  ASSET_TYPES.IMAGE_JPEG,
  ASSET_TYPES.IMAGE_PNG,
  ASSET_TYPES.IMAGE_WEBP,
]);

// The assets that we allow the users to upload
export const SUPPORTED_UPLOAD_ASSET_TYPES: Set<string> = new Set<string>([
  ...IMAGE_ASSET_TYPES,
  ...VIDEO_ASSET_TYPES,
  ASSET_TYPES.TEXT_HTML,
  ASSET_TYPES.APPLICATION_PDF,
]);

// The assets that we allow as a bookmark of type asset
export const SUPPORTED_BOOKMARK_ASSET_TYPES: Set<string> = new Set<string>([
  ...IMAGE_ASSET_TYPES,
  ASSET_TYPES.APPLICATION_PDF,
]);

// The assets that we support saving in the asset db
export const SUPPORTED_ASSET_TYPES: Set<string> = new Set<string>([
  ...SUPPORTED_UPLOAD_ASSET_TYPES,
  ASSET_TYPES.TEXT_HTML,
  ASSET_TYPES.VIDEO_MP4,
  ASSET_TYPES.APPLICATION_ZIP,
  ASSET_TYPES.AUDIO_MPEG,
  ASSET_TYPES.AUDIO_WAV,
  ASSET_TYPES.AUDIO_OGG,
  ASSET_TYPES.AUDIO_AAC,
  ASSET_TYPES.AUDIO_FLAC,
]);

export const zAssetMetadataSchema = z.object({
  contentType: z.string(),
  fileName: z.string().nullish(),
});

export type AssetMetadata = z.infer<typeof zAssetMetadataSchema>;

export interface AssetInfo {
  userId: string;
  assetId: string;
  contentType: string;
  fileName?: string | null;
  size: number;
}

export interface AssetStore {
  saveAsset(params: {
    userId: string;
    assetId: string;
    asset: Buffer;
    metadata: AssetMetadata;
  }): Promise<void>;

  saveAssetFromFile(params: {
    userId: string;
    assetId: string;
    assetPath: string;
    metadata: AssetMetadata;
  }): Promise<void>;

  readAsset(params: {
    userId: string;
    assetId: string;
    start?: number;
    end?: number;
  }): Promise<{ asset: Buffer; metadata: AssetMetadata }>;

  createAssetReadStream(params: {
    userId: string;
    assetId: string;
    start?: number;
    end?: number;
  }): Promise<NodeJS.ReadableStream>;

  readAssetMetadata(params: {
    userId: string;
    assetId: string;
  }): Promise<AssetMetadata>;

  getAssetSize(params: { userId: string; assetId: string }): Promise<number>;

  deleteAsset(params: { userId: string; assetId: string }): Promise<void>;

  deleteUserAssets(params: { userId: string }): Promise<void>;

  getAllAssets(): AsyncGenerator<AssetInfo>;
}
