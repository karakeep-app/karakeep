import { beforeEach, describe, expect, test } from "vitest";

import { assets, AssetTypes } from "@karakeep/db/schema";
import { BookmarkTypes, ZAssetType } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Asset Routes", () => {
  test<CustomTestContext>("mutate assets", async ({ apiCallers, db }) => {
    const api = apiCallers[0].assets;
    const userId = await apiCallers[0].users.whoami().then((u) => u.id);

    const bookmark = await apiCallers[0].bookmarks.createBookmark({
      url: "https://google.com",
      type: BookmarkTypes.LINK,
    });
    await Promise.all([
      db.insert(assets).values({
        id: "asset1",
        assetType: AssetTypes.LINK_SCREENSHOT,
        bookmarkId: bookmark.id,
        userId,
      }),
      db.insert(assets).values({
        id: "asset2",
        assetType: AssetTypes.LINK_BANNER_IMAGE,
        bookmarkId: bookmark.id,
        userId,
      }),
      db.insert(assets).values({
        id: "asset3",
        assetType: AssetTypes.LINK_FULL_PAGE_ARCHIVE,
        bookmarkId: bookmark.id,
        userId,
      }),
      db.insert(assets).values({
        id: "asset4",
        assetType: AssetTypes.UNKNOWN,
        bookmarkId: null,
        userId,
      }),
      db.insert(assets).values({
        id: "asset5",
        assetType: AssetTypes.UNKNOWN,
        bookmarkId: null,
        userId,
      }),
      db.insert(assets).values({
        id: "asset6",
        assetType: AssetTypes.UNKNOWN,
        bookmarkId: null,
        userId,
      }),
    ]);

    const validateAssets = async (
      expected: {
        id: string;
        assetType: ZAssetType;
        fileName: string | null;
      }[],
    ) => {
      const b = await apiCallers[0].bookmarks.getBookmark({
        bookmarkId: bookmark.id,
      });
      b.assets.sort((a, b) => a.id.localeCompare(b.id));
      expect(b.assets).toEqual(expected);
    };

    await api.attachAsset({
      bookmarkId: bookmark.id,
      asset: {
        id: "asset4",
        assetType: "screenshot",
      },
    });

    await validateAssets([
      { id: "asset1", assetType: "screenshot", fileName: null },
      { id: "asset2", assetType: "bannerImage", fileName: null },
      { id: "asset3", assetType: "fullPageArchive", fileName: null },
      { id: "asset4", assetType: "screenshot", fileName: null },
    ]);

    await api.replaceAsset({
      bookmarkId: bookmark.id,
      oldAssetId: "asset1",
      newAssetId: "asset5",
    });

    await validateAssets([
      { id: "asset2", assetType: "bannerImage", fileName: null },
      { id: "asset3", assetType: "fullPageArchive", fileName: null },
      { id: "asset4", assetType: "screenshot", fileName: null },
      { id: "asset5", assetType: "screenshot", fileName: null },
    ]);

    await api.detachAsset({
      bookmarkId: bookmark.id,
      assetId: "asset4",
    });

    await validateAssets([
      { id: "asset2", assetType: "bannerImage", fileName: null },
      { id: "asset3", assetType: "fullPageArchive", fileName: null },
      { id: "asset5", assetType: "screenshot", fileName: null },
    ]);

    // You're not allowed to attach/replace a fullPageArchive
    await expect(
      async () =>
        await api.replaceAsset({
          bookmarkId: bookmark.id,
          oldAssetId: "asset3",
          newAssetId: "asset6",
        }),
    ).rejects.toThrow(/You can't attach this type of asset/);
    await expect(
      async () =>
        await api.attachAsset({
          bookmarkId: bookmark.id,
          asset: {
            id: "asset6",
            assetType: "fullPageArchive",
          },
        }),
    ).rejects.toThrow(/You can't attach this type of asset/);
  });
});
