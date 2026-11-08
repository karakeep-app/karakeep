import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { assets, AssetTypes, bookmarks } from "@karakeep/db/schema";
import { BookmarkTypes, ZAssetType } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Asset Routes", () => {
  test<CustomTestContext>("list assets", async ({ apiCallers, db }) => {
    const api = apiCallers[0].assets;
    const userId = await apiCallers[0].users.whoami().then((u) => u.id);
    const otherUserId = await apiCallers[1].users.whoami().then((u) => u.id);

    const older = await apiCallers[0].bookmarks.createBookmark({
      url: "https://older.example.com/article",
      title: "Older bookmark",
      type: BookmarkTypes.LINK,
    });
    const newer = await apiCallers[0].bookmarks.createBookmark({
      text: "Some note",
      type: BookmarkTypes.TEXT,
    });
    await db
      .update(bookmarks)
      .set({ createdAt: new Date("2020-01-01") })
      .where(eq(bookmarks.id, older.id));
    await db
      .update(bookmarks)
      .set({ createdAt: new Date("2024-01-01") })
      .where(eq(bookmarks.id, newer.id));
    await db.insert(assets).values([
      {
        id: "big",
        assetType: AssetTypes.LINK_SCREENSHOT,
        bookmarkId: older.id,
        size: 300,
        userId,
      },
      {
        id: "medium",
        assetType: AssetTypes.ASSET_SCREENSHOT,
        bookmarkId: newer.id,
        size: 200,
        userId,
      },
      {
        // A second asset on the same bookmark, ordered after "big" by id.
        id: "tiny",
        assetType: AssetTypes.LINK_BANNER_IMAGE,
        bookmarkId: older.id,
        size: 50,
        userId,
      },
      {
        id: "small",
        assetType: AssetTypes.AVATAR,
        bookmarkId: null,
        size: 100,
        userId,
      },
      {
        id: "someone-elses",
        assetType: AssetTypes.UNKNOWN,
        bookmarkId: null,
        size: 1000,
        userId: otherUserId,
      },
    ]);

    const bySize = await api.list({ limit: 2 });
    expect(bySize.assets.map((a) => a.id)).toEqual(["big", "medium"]);
    expect(bySize.totalCount).toEqual(4);
    expect(bySize.totalSize).toEqual(650);
    expect(bySize.nextCursor).toEqual(2);
    expect(bySize.assets[0]).toMatchObject({
      bookmarkId: older.id,
      bookmarkTitle: "Older bookmark",
      bookmarkUrl: "https://older.example.com/article",
    });
    expect(bySize.assets[1]).toMatchObject({
      bookmarkId: newer.id,
      bookmarkTitle: null,
      bookmarkUrl: null,
    });

    const byNewest = await api.list({ limit: 10, sortBy: "newest" });
    expect(byNewest.assets.map((a) => a.id)).toEqual([
      "medium",
      "big",
      "tiny",
      "small",
    ]);
    expect(byNewest.assets[3]).toMatchObject({
      bookmarkId: null,
      bookmarkTitle: null,
      bookmarkUrl: null,
    });

    // Pages that cross from assets with a bookmark to ones without: with a
    // limit of 2, page 2 holds the last bookmarked asset and the first one
    // without; with 3, page 2 holds only assets without one.
    for (const limit of [1, 2, 3]) {
      const ids: string[] = [];
      let cursor: number | null | undefined = undefined;
      do {
        const res: Awaited<ReturnType<typeof api.list>> = await api.list({
          limit,
          cursor,
          sortBy: "newest",
        });
        ids.push(...res.assets.map((a) => a.id));
        cursor = res.nextCursor;
      } while (cursor);
      expect(ids).toEqual(["medium", "big", "tiny", "small"]);
    }
  });

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
