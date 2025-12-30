import { eq } from "drizzle-orm";

import { db, KarakeepDBTransaction } from "@karakeep/db";
import { assets, AssetTypes, bookmarks } from "@karakeep/db/schema";

type DBAssetType = typeof assets.$inferInsert;
export async function updateAsset(
  oldAssetId: string | undefined,
  newAsset: DBAssetType,
  txn: KarakeepDBTransaction,
) {
  if (oldAssetId) {
    await txn.delete(assets).where(eq(assets.id, oldAssetId));
  }

  await txn.insert(assets).values(newAsset);
}

export async function getBookmarkDetails(bookmarkId: string) {
  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    with: {
      link: true,
      assets: true,
    },
  });

  if (!bookmark || !bookmark.link) {
    throw new Error("The bookmark either doesn't exist or is not a link");
  }
  return {
    url: bookmark.link.url,
    userId: bookmark.userId,
    screenshotAssetId: bookmark.assets.find(
      (a) => a.assetType == AssetTypes.LINK_SCREENSHOT,
    )?.id,
    pdfAssetId: bookmark.assets.find((a) => a.assetType == AssetTypes.LINK_PDF)
      ?.id,
    imageAssetId: bookmark.assets.find(
      (a) => a.assetType == AssetTypes.LINK_BANNER_IMAGE,
    )?.id,
    fullPageArchiveAssetId: bookmark.assets.find(
      (a) => a.assetType == AssetTypes.LINK_FULL_PAGE_ARCHIVE,
    )?.id,
    videoAssetId: bookmark.assets.find(
      (a) => a.assetType == AssetTypes.LINK_VIDEO,
    )?.id,
    precrawledArchiveAssetId: bookmark.assets
      .filter((a) => a.assetType == AssetTypes.LINK_PRECRAWLED_ARCHIVE)
      .at(-1)?.id,
    contentAssetId: bookmark.assets.find(
      (a) => a.assetType == AssetTypes.LINK_HTML_CONTENT,
    )?.id,
  };
}
