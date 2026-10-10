import { ASSET_TYPES } from "@karakeep/shared/assetdb";
import logger from "@karakeep/shared/logger";

// Banners are displayed at most ~768px wide (the bookmark preview), so this
// leaves enough room for high density screens.
const BANNER_MAX_WIDTH = 1200;

// Banners come from untrusted pages, and a small compressed image can decode
// into a huge number of pixels. Larger images are stored as is instead.
const BANNER_MAX_INPUT_PIXELS = 50_000_000;

/**
 * Banners are only ever displayed, so we store a downscaled webp version of
 * them instead of the original. Returns null if the banner should be stored
 * as is (gifs, already webp, animated, not any smaller as webp, or if the
 * conversion failed).
 */
export async function optimizeBannerImage(
  image: Buffer,
  contentType: string,
): Promise<{ image: Buffer; contentType: string } | null> {
  if (
    contentType !== ASSET_TYPES.IMAGE_JPEG &&
    contentType !== ASSET_TYPES.IMAGE_PNG
  ) {
    return null;
  }
  try {
    // Lazily loaded as it's a native module that most users of this package don't need.
    const { default: sharp } = await import("sharp");
    const pipeline = sharp(image, {
      limitInputPixels: BANNER_MAX_INPUT_PIXELS,
    });
    const metadata = await pipeline.metadata();
    if ((metadata.pages ?? 1) > 1) {
      return null;
    }
    const optimized = await pipeline
      .rotate() // Apply the EXIF orientation
      .resize({ width: BANNER_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    // webp isn't always smaller (e.g. small or heavily compressed pngs).
    if (optimized.byteLength >= image.byteLength) {
      return null;
    }
    return { image: optimized, contentType: ASSET_TYPES.IMAGE_WEBP };
  } catch (e) {
    // Optimizing is best effort, the original gets stored instead.
    logger.warn(`Failed to optimize the banner image: ${e}`);
    return null;
  }
}
