import { beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import {
  assets,
  AssetTypes,
  bookmarkAssets,
  bookmarkLinks,
  bookmarks,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { zPdfHighlightAnchorSchema } from "@karakeep/shared/types/highlights";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

async function makePdf(ctx: CustomTestContext, uploaded = false) {
  const bookmark = await ctx.apiCallers[0].bookmarks.createBookmark({
    type: BookmarkTypes.LINK,
    url: "https://example.com/paper.pdf",
  });
  const assetId = `pdf-${bookmark.id}`;
  await ctx.db.insert(assets).values({
    id: assetId,
    userId: bookmark.userId,
    bookmarkId: bookmark.id,
    assetType: uploaded ? AssetTypes.BOOKMARK_ASSET : AssetTypes.LINK_PDF,
    contentType: "application/pdf",
  });
  if (uploaded) {
    await ctx.db.delete(bookmarkLinks).where(eq(bookmarkLinks.id, bookmark.id));
    await ctx.db
      .update(bookmarks)
      .set({ type: BookmarkTypes.ASSET })
      .where(eq(bookmarks.id, bookmark.id));
    await ctx.db
      .insert(bookmarkAssets)
      .values({ id: bookmark.id, assetId, assetType: "pdf" });
  }
  return {
    bookmark,
    assetId,
    input: {
      bookmarkId: bookmark.id,
      startOffset: 0,
      endOffset: 0,
      color: "yellow" as const,
      text: "A passage on the second page",
      note: "Review this",
      pdfAnchor: {
        version: 1 as const,
        assetId,
        rects: [{ pageIndex: 1, x1: 20, y1: 60, x2: 220, y2: 72 }],
      },
    },
  };
}

describe("PDF highlight persistence", () => {
  for (const uploaded of [false, true]) {
    test<CustomTestContext>(`round-trips ${uploaded ? "uploaded" : "linked"} PDF positions through CRUD`, async (ctx) => {
      const { input } = await makePdf(ctx, uploaded);
      const api = ctx.apiCallers[0].highlights;
      const saved = await api.create(input);
      expect(saved.pdfAnchor).toEqual(input.pdfAnchor);
      expect((await api.get({ highlightId: saved.id })).pdfAnchor).toEqual(
        input.pdfAnchor,
      );
      expect(
        (await api.getForBookmark({ bookmarkId: input.bookmarkId }))
          .highlights[0].pdfAnchor,
      ).toEqual(input.pdfAnchor);
      expect((await api.getAll({})).highlights[0].pdfAnchor).toEqual(
        input.pdfAnchor,
      );
      const edited = await api.update({
        highlightId: saved.id,
        color: "blue",
        note: "Updated note",
      });
      expect(edited.pdfAnchor).toEqual(input.pdfAnchor);
      expect(edited.color).toBe("blue");
      expect(edited.note).toBe("Updated note");
      await api.delete({ highlightId: saved.id });
      expect(
        (await api.getForBookmark({ bookmarkId: input.bookmarkId })).highlights,
      ).toEqual([]);
    });
  }

  test<CustomTestContext>("legacy HTML and PDF highlights remain distinguishable", async (ctx) => {
    const { input } = await makePdf(ctx);
    const api = ctx.apiCallers[0].highlights;
    const html = await api.create({
      ...input,
      pdfAnchor: undefined,
      startOffset: 5,
      endOffset: 15,
    });
    const pdf = await api.create(input);
    expect(html.pdfAnchor).toBeNull();
    expect(html.startOffset).toBe(5);
    expect(pdf.startOffset).toBe(0);
    const saved = (await api.getForBookmark({ bookmarkId: input.bookmarkId }))
      .highlights;
    expect(saved.filter((h) => !h.pdfAnchor).map((h) => h.id)).toEqual([
      html.id,
    ]);
  });

  test<CustomTestContext>("rejects anchors to unrelated, missing or non-PDF assets", async (ctx) => {
    const { input, bookmark } = await makePdf(ctx);
    const other = await ctx.apiCallers[0].bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://example.com/other",
    });
    await ctx.db.insert(assets).values([
      {
        id: "other-pdf",
        userId: bookmark.userId,
        bookmarkId: other.id,
        assetType: AssetTypes.LINK_PDF,
      },
      {
        id: "screenshot",
        userId: bookmark.userId,
        bookmarkId: bookmark.id,
        assetType: AssetTypes.LINK_SCREENSHOT,
      },
    ]);
    for (const assetId of ["missing", "other-pdf", "screenshot"]) {
      await expect(
        ctx.apiCallers[0].highlights.create({
          ...input,
          pdfAnchor: { ...input.pdfAnchor, assetId },
        }),
      ).rejects.toThrow(/PDF attached/);
    }
  });

  test<CustomTestContext>("preserves PDF positions when the source asset is replaced", async (ctx) => {
    const { input } = await makePdf(ctx);
    const api = ctx.apiCallers[0].highlights;
    const saved = await api.create(input);
    // Removing the source asset should retain the user's saved passage and note.
    await ctx.db.delete(assets);
    const restored = await api.get({ highlightId: saved.id });
    expect(restored.text).toBe(input.text);
    expect(restored.pdfAnchor?.assetId).toBe(input.pdfAnchor.assetId);
    expect(await ctx.db.select().from(bookmarks)).toHaveLength(1);
  });

  test<CustomTestContext>("PDF records cannot accidentally use HTML offsets", async (ctx) => {
    const { input } = await makePdf(ctx);
    await expect(
      ctx.apiCallers[0].highlights.create({ ...input, endOffset: 20 }),
    ).rejects.toThrow(/rectangles instead/);
  });
});

describe("PDF anchor validation", () => {
  const rect = { pageIndex: 0, x1: 10, y1: 20, x2: 30, y2: 40 };
  test("rejects invalid positions and empty/oversized selections", () => {
    const invalid = [
      [],
      Array(513).fill(rect),
      [{ ...rect, pageIndex: -1 }],
      [{ ...rect, pageIndex: 0.5 }],
      [{ ...rect, x2: 10 }],
      [{ ...rect, y2: 0 }],
      [{ ...rect, x1: NaN }],
    ];
    for (const rects of invalid) {
      expect(
        zPdfHighlightAnchorSchema.safeParse({
          version: 1,
          assetId: "pdf",
          rects,
        }).success,
      ).toBe(false);
    }
  });
});
