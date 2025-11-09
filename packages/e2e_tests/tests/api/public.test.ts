import { assert, beforeEach, describe, expect, inject, it } from "vitest";
import { z } from "zod";

import { createSignedToken } from "@karakeep/shared/signedTokens";
import { zAssetSignedTokenSchema } from "@karakeep/shared/types/assets";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { createTestUser, uploadTestAsset } from "../../utils/api";
import { waitUntil } from "../../utils/general";
import { getTrpcClient } from "../../utils/trpc";

const SINGING_SECRET = "secret";

describe("Public API", () => {
  const port = inject("karakeepPort");

  if (!port) {
    throw new Error("Missing required environment variables");
  }

  let apiKey: string; // For the primary test user

  async function seedDatabase(currentApiKey: string) {
    const trpcClient = getTrpcClient(currentApiKey);

    // Create two lists
    const publicList = await trpcClient.lists.create.mutate({
      name: "Public List",
      icon: "🚀",
      type: "manual",
    });

    await trpcClient.lists.edit.mutate({
      listId: publicList.id,
      public: true,
    });

    // Create two bookmarks
    const createBookmark1 = await trpcClient.bookmarks.createBookmark.mutate({
      title: "Test Bookmark #1",
      url: "http://nginx:80/hello.html",
      type: BookmarkTypes.LINK,
    });

    // Create a second bookmark with an asset
    const file = new File(["test content"], "test.pdf", {
      type: "application/pdf",
    });

    const uploadResponse = await uploadTestAsset(currentApiKey, port, file);
    const createBookmark2 = await trpcClient.bookmarks.createBookmark.mutate({
      title: "Test Bookmark #2",
      type: BookmarkTypes.ASSET,
      assetType: "pdf",
      assetId: uploadResponse.assetId,
    });

    await trpcClient.lists.addToList.mutate({
      listId: publicList.id,
      bookmarkId: createBookmark1.id,
    });
    await trpcClient.lists.addToList.mutate({
      listId: publicList.id,
      bookmarkId: createBookmark2.id,
    });

    return { publicList, createBookmark1, createBookmark2 };
  }

  beforeEach(async () => {
    apiKey = await createTestUser();
  });

  it("should get public bookmarks", async () => {
    const { publicList } = await seedDatabase(apiKey);
    const trpcClient = getTrpcClient(apiKey);

    const res = await trpcClient.publicBookmarks.getPublicBookmarksInList.query(
      {
        listId: publicList.id,
      },
    );

    expect(res.bookmarks.length).toBe(2);
  });

  it("should be able to access the assets of the public bookmarks", async () => {
    const { publicList, createBookmark1, createBookmark2 } =
      await seedDatabase(apiKey);

    const trpcClient = getTrpcClient(apiKey);
    // Wait for link bookmark to be crawled and have a banner image (screenshot)
    await waitUntil(async () => {
      const res = await trpcClient.bookmarks.getBookmark.query({
        bookmarkId: createBookmark1.id,
      });
      assert(res.content.type === BookmarkTypes.LINK);
      // Check for screenshotAssetId as bannerImageUrl might be derived from it or original imageUrl
      return !!res.content.screenshotAssetId || !!res.content.imageUrl;
    }, "Bookmark is crawled and has banner info");

    const res = await trpcClient.publicBookmarks.getPublicBookmarksInList.query(
      {
        listId: publicList.id,
      },
    );

    const b1Resp = res.bookmarks.find((b) => b.id === createBookmark1.id);
    expect(b1Resp).toBeDefined();
    const b2Resp = res.bookmarks.find((b) => b.id === createBookmark2.id);
    expect(b2Resp).toBeDefined();

    assert(b1Resp!.content.type === BookmarkTypes.LINK);
    assert(b2Resp!.content.type === BookmarkTypes.ASSET);

    {
      // Banner image fetch for link bookmark
      assert(
        b1Resp!.bannerImageUrl,
        "Link bookmark should have a bannerImageUrl",
      );
      const assetFetch = await fetch(b1Resp!.bannerImageUrl);
      expect(assetFetch.status).toBe(200);
    }

    {
      // Actual asset fetch for asset bookmark
      assert(
        b2Resp!.content.assetUrl,
        "Asset bookmark should have an assetUrl",
      );
      const assetFetch = await fetch(b2Resp!.content.assetUrl);
      expect(assetFetch.status).toBe(200);
    }
  });

  it("Accessing non public list should fail", async () => {
    const trpcClient = getTrpcClient(apiKey);
    const nonPublicList = await trpcClient.lists.create.mutate({
      name: "Non Public List",
      icon: "🚀",
      type: "manual",
    });

    await expect(
      trpcClient.publicBookmarks.getPublicBookmarksInList.query({
        listId: nonPublicList.id,
      }),
    ).rejects.toThrow(/List not found/);
  });

  describe("Public asset token validation", () => {
    let userId: string;
    let assetId: string; // Asset belonging to the primary user (userId)

    beforeEach(async () => {
      const trpcClient = getTrpcClient(apiKey);
      const whoami = await trpcClient.users.whoami.query();
      userId = whoami.id;
      const assetUpload = await uploadTestAsset(
        apiKey,
        port,
        new File(["test content for token validation"], "token_test.pdf", {
          type: "application/pdf",
        }),
      );
      assetId = assetUpload.assetId;
    });

    it("should succeed with a valid token", async () => {
      const token = createSignedToken(
        {
          assetId,
          userId,
        } as z.infer<typeof zAssetSignedTokenSchema>,
        SINGING_SECRET,
        Date.now() + 60000, // Expires in 60 seconds
      );
      const res = await fetch(
        `http://localhost:${port}/api/public/assets/${assetId}?token=${token}`,
      );
      expect(res.status).toBe(200);
      expect((await res.blob()).type).toBe("application/pdf");
    });

    it("should fail without a token", async () => {
      const res = await fetch(
        `http://localhost:${port}/api/public/assets/${assetId}`,
      );
      expect(res.status).toBe(400); // Bad Request due to missing token query param
    });

    it("should fail with a malformed token string (e.g., not base64)", async () => {
      const res = await fetch(
        `http://localhost:${port}/api/public/assets/${assetId}?token=thisIsNotValidBase64!@#`,
      );
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(
        expect.objectContaining({ error: "Invalid or expired token" }),
      );
    });

    it("should fail with a token having a structurally invalid inner payload", async () => {
      // Payload that doesn't conform to zAssetSignedTokenSchema (e.g. misspelled key)
      const malformedInnerPayload = {
        asset_id_mispelled: assetId,
        userId: userId,
      };
      const token = createSignedToken(
        malformedInnerPayload,
        SINGING_SECRET,
        Date.now() + 60000,
      );
      const res = await fetch(
        `http://localhost:${port}/api/public/assets/${assetId}?token=${token}`,
      );
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(
        expect.objectContaining({ error: "Invalid or expired token" }),
      );
    });

    it("should fail after token expiry", async () => {
      const token = createSignedToken(
        {
          assetId,
          userId,
        } as z.infer<typeof zAssetSignedTokenSchema>,
        SINGING_SECRET,
        Date.now() + 1000, // Expires in 1 second
      );

      // Wait for more than 1 second to ensure expiry
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const res = await fetch(
        `http://localhost:${port}/api/public/assets/${assetId}?token=${token}`,
      );
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(
        expect.objectContaining({ error: "Invalid or expired token" }),
      );
    });

    it("should fail when using a valid token for a different asset", async () => {
      const anotherAssetUpload = await uploadTestAsset(
        apiKey, // Same user
        port,
        new File(["other content"], "other_asset.pdf", {
          type: "application/pdf",
        }),
      );
      const anotherAssetId = anotherAssetUpload.assetId;

      // Token is valid for 'anotherAssetId'
      const tokenForAnotherAsset = createSignedToken(
        {
          assetId: anotherAssetId,
          userId,
        } as z.infer<typeof zAssetSignedTokenSchema>,
        SINGING_SECRET,
        Date.now() + 60000,
      );

      // Attempt to use this token to access the original 'assetId'
      const res = await fetch(
        `http://localhost:${port}/api/public/assets/${assetId}?token=${tokenForAnotherAsset}`,
      );
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(
        expect.objectContaining({ error: "Invalid or expired token" }),
      );
    });

    it("should fail if token's userId does not own the requested assetId (expect 404)", async () => {
      // User1 (primary, `apiKey`, `userId`) owns `assetId` (from beforeEach)

      // Create User2 - ensure unique email for user creation
      const apiKeyUser2 = await createTestUser();
      const trpcClientUser2 = getTrpcClient(apiKeyUser2);
      const whoamiUser2 = await trpcClientUser2.users.whoami.query();
      const userIdUser2 = whoamiUser2.id;

      // Generate a token where the payload claims assetId is being accessed by userIdUser2,
      // but assetId actually belongs to the original userId.
      const tokenForUser2AttemptingAsset1 = createSignedToken(
        {
          assetId: assetId, // assetId belongs to user1 (userId)
          userId: userIdUser2, // token claims user2 is accessing it
        } as z.infer<typeof zAssetSignedTokenSchema>,
        SINGING_SECRET,
        Date.now() + 60000,
      );

      // User2 attempts to access assetId (owned by User1) using a token that has User2's ID in its payload.
      // The API route will use userIdUser2 from the token to query the DB for assetId.
      // Since assetId is not owned by userIdUser2, the DB query will find nothing.
      const res = await fetch(
        `http://localhost:${port}/api/public/assets/${assetId}?token=${tokenForUser2AttemptingAsset1}`,
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(
        expect.objectContaining({ error: "Asset not found" }),
      );
    });

    it("should fail for a token referencing a non-existent assetId (expect 404)", async () => {
      const nonExistentAssetId = `nonexistent-asset-${Date.now()}`;
      const token = createSignedToken(
        {
          assetId: nonExistentAssetId,
          userId, // Valid userId from the primary user
        } as z.infer<typeof zAssetSignedTokenSchema>,
        SINGING_SECRET,
        Date.now() + 60000,
      );

      const res = await fetch(
        `http://localhost:${port}/api/public/assets/${nonExistentAssetId}?token=${token}`,
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(
        expect.objectContaining({ error: "Asset not found" }),
      );
    });
  });
});
