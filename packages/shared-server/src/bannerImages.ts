import { ASSET_TYPES } from "@karakeep/shared/assetdb";

// Banners are displayed at most ~768px wide (the bookmark preview), so this
// leaves enough room for high density screens.
const BANNER_MAX_WIDTH = 1200;

/**
 * Banners are only ever displayed, so we store a downscaled webp version of
 * them instead of the original. Returns null if the banner should be stored
 * as is (gifs, already webp, or animated).
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
  // Lazily loaded as it's a native module that most users of this package don't need.
  const { default: sharp } = await import("sharp");
  const pipeline = sharp(image);
  const metadata = await pipeline.metadata();
  if ((metadata.pages ?? 1) > 1) {
    return null;
  }
  const optimized = await pipeline
    .rotate() // Apply the EXIF orientation
    .resize({ width: BANNER_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  return { image: optimized, contentType: ASSET_TYPES.IMAGE_WEBP };
}
