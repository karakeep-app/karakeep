import { beforeEach, describe, expect, test } from "vitest";

import { assets, AssetTypes } from "@karakeep/db/schema";
import { verifySignedToken } from "@karakeep/shared/signedTokens";
import { zAssetSignedTokenSchema } from "@karakeep/shared/types/assets";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

import type { AuthedContext } from "../index";
import { Bookmark } from "../models/bookmarks";
import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Public Bookmarks", () => {
  test<CustomTestContext>("asPublicBookmark rewrites URLs of assets attached to the bookmark to signed public URLs, leaving unattached asset URLs untouched", async ({
    apiCallers,
    db,
  }) => {
    const api = apiCallers[0];
    const userId = await api.users.whoami().then((u) => u.id);

    const noteImageId = crypto.randomUUID();
    // A generic file attachment (e.g. via the "attach file" UI) that was
    // manually referenced as an image in the note's markdown.
    const attachedFileId = crypto.randomUUID();
    const unrelatedAssetId = crypto.randomUUID();

    const bookmark = await api.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: `A note with an image ![img](${getAssetUrl(
        noteImageId,
      )}), an attached file ![file](${getAssetUrl(
        attachedFileId,
      )}), and a link to an unrelated asset ${getAssetUrl(unrelatedAssetId)}`,
    });

    // noteImageId and attachedFileId are both attached to this bookmark
    // (just via different assetTypes), while unrelatedAssetId is not
    // attached to it at all.
    await db.insert(assets).values([
      {
        id: noteImageId,
        assetType: AssetTypes.NOTE_IMAGE,
        bookmarkId: bookmark.id,
        userId,
      },
      {
        id: attachedFileId,
        assetType: AssetTypes.USER_UPLOADED,
        bookmarkId: bookmark.id,
        userId,
      },
      {
        id: unrelatedAssetId,
        assetType: AssetTypes.USER_UPLOADED,
        bookmarkId: null,
        userId,
      },
    ]);

    const ctx: AuthedContext = {
      user: { id: userId, email: undefined, role: "user" },
      db,
      req: { ip: null },
    };
    const bookmarkModel = await Bookmark.fromId(ctx, bookmark.id, true);
    const publicBookmark = bookmarkModel.asPublicBookmark();

    expect(publicBookmark.content.type).toEqual(BookmarkTypes.TEXT);
    const text = (publicBookmark.content as { text: string }).text;

    // The unrelated asset URL must be untouched.
    expect(text).toContain(getAssetUrl(unrelatedAssetId));

    // Both assets attached to this bookmark must have been rewritten to
    // signed public URLs pointing at the same asset ids, regardless of
    // assetType.
    for (const assetId of [noteImageId, attachedFileId]) {
      expect(text).not.toContain(getAssetUrl(assetId));
      const match = text.match(
        new RegExp(`/public/assets/${assetId}\\?token=([^)\\s]+)`),
      );
      expect(match).not.toBeNull();
      const [, token] = match!;
      const payload = verifySignedToken(
        token,
        "test-secret",
        zAssetSignedTokenSchema,
      );
      expect(payload).toEqual({ assetId, userId });
    }
  });
});
