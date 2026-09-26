import { beforeEach, describe, expect, test } from "vitest";

import { assets, AssetTypes } from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

const location = {
  assetId: "pdf-one",
  rects: [
    { page: 1, x1: 10, y1: 20, x2: 120, y2: 35 },
    { page: 2, x1: 15, y1: 25, x2: 180, y2: 40 },
  ],
};

async function fixture({ apiCallers, db }: CustomTestContext) {
  const bookmark = await apiCallers[0].bookmarks.createBookmark({
    type: BookmarkTypes.LINK,
    url: "https://example.com/paper.pdf",
  });
  await db.insert(assets).values({
    id: location.assetId,
    userId: bookmark.userId,
    bookmarkId: bookmark.id,
    assetType: AssetTypes.LINK_PDF,
    contentType: "application/pdf",
  });
  return {
    bookmarkId: bookmark.id,
    startOffset: 0,
    endOffset: 0,
    color: "yellow" as const,
    text: "First page\n\nSecond page",
    note: null,
    pdfLocation: location,
  };
}

describe("PDF highlight persistence", () => {
  test<CustomTestContext>("supports uploaded PDF bookmarks and rejects non-PDF assets", async (context) => {
    const api = context.apiCallers[0];
    const user = await api.users.whoami();
    await context.db.insert(assets).values({
      id: "uploaded-pdf",
      userId: user.id,
      assetType: AssetTypes.UNKNOWN,
      contentType: "application/pdf",
    });
    const bookmark = await api.bookmarks.createBookmark({
      type: BookmarkTypes.ASSET,
      assetType: "pdf",
      assetId: "uploaded-pdf",
    });
    const input = {
      bookmarkId: bookmark.id,
      startOffset: 0,
      endOffset: 0,
      text: "Uploaded PDF",
      note: null,
      color: "yellow" as const,
      pdfLocation: { ...location, assetId: "uploaded-pdf" },
    };
    expect(await api.highlights.create(input)).toMatchObject({
      pdfLocation: input.pdfLocation,
    });
    await context.db.insert(assets).values({
      id: "image",
      userId: user.id,
      bookmarkId: bookmark.id,
      assetType: AssetTypes.LINK_SCREENSHOT,
      contentType: "image/png",
    });
    await expect(
      api.highlights.create({
        ...input,
        pdfLocation: { ...location, assetId: "image" },
      }),
    ).rejects.toThrow();
  });
  test<CustomTestContext>("round trips page geometry, text and edits without changing legacy highlights", async (context) => {
    const input = await fixture(context);
    const api = context.apiCallers[0].highlights;
    const saved = await api.create(input);
    expect(saved).toMatchObject({ pdfLocation: location, text: input.text });
    await api.update({
      highlightId: saved.id,
      note: "Read again",
      color: "blue",
    });
    expect(await api.get({ highlightId: saved.id })).toMatchObject({
      pdfLocation: location,
      note: "Read again",
      color: "blue",
    });
    const { pdfLocation: _, ...legacy } = input;
    const old = await api.create({ ...legacy, startOffset: 1, endOffset: 4 });
    expect(old).toMatchObject({
      startOffset: 1,
      endOffset: 4,
      pdfLocation: null,
    });
    expect(
      (await api.getForBookmark({ bookmarkId: input.bookmarkId })).highlights,
    ).toHaveLength(2);
    await api.delete({ highlightId: saved.id });
    await expect(api.get({ highlightId: saved.id })).rejects.toThrow();
  });

  test<CustomTestContext>("rejects geometry for an unrelated or missing asset", async (context) => {
    const input = await fixture(context);
    await expect(
      context.apiCallers[0].highlights.create({
        ...input,
        pdfLocation: { ...location, assetId: "missing" },
      }),
    ).rejects.toThrow();
    const other = await context.apiCallers[0].bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://example.com/other",
    });
    await expect(
      context.apiCallers[0].highlights.create({
        ...input,
        bookmarkId: other.id,
      }),
    ).rejects.toThrow();
  });

  test<CustomTestContext>("keeps creation and editing owner-only", async (context) => {
    const input = await fixture(context);
    await expect(
      context.apiCallers[1].highlights.create(input),
    ).rejects.toThrow();
    const saved = await context.apiCallers[0].highlights.create(input);
    await expect(
      context.apiCallers[1].highlights.update({
        highlightId: saved.id,
        color: "red",
      }),
    ).rejects.toThrow();
    await expect(
      context.apiCallers[1].highlights.delete({ highlightId: saved.id }),
    ).rejects.toThrow();
  });

  test<CustomTestContext>("rejects empty, reversed, or non-finite page rectangles", async (context) => {
    const input = await fixture(context);
    for (const rects of [
      [],
      [{ ...location.rects[0], page: 0 }],
      [{ ...location.rects[0], x2: 0 }],
      [{ ...location.rects[0], y2: Infinity }],
    ]) {
      await expect(
        context.apiCallers[0].highlights.create({
          ...input,
          pdfLocation: { ...location, rects },
        }),
      ).rejects.toThrow();
    }
  });
});
