import { describe, expect, test } from "vitest";

import {
  buildScreenPdfPageCss,
  computeScreenPdfLayout,
  computeScreenPdfScrollTarget,
  SCREEN_PDF_SAFE_MAX_TOTAL_HEIGHT_PX,
} from "./screenPdfLayout";

const base = {
  minHeight: 900,
  maxPageHeightPx: 19_200,
  maxTotalHeightPx: 60_000,
};

describe("computeScreenPdfLayout", () => {
  test("uses a single page for short documents", () => {
    expect(computeScreenPdfLayout({ ...base, rawHeight: 5_000 })).toEqual({
      measuredHeight: 5_000,
      totalHeight: 5_000,
      pageHeight: 5_001,
      numPages: 1,
      clipped: false,
    });
  });

  test("never renders shorter than the viewport", () => {
    expect(
      computeScreenPdfLayout({ ...base, rawHeight: 100, minHeight: 900 }),
    ).toMatchObject({
      measuredHeight: 900,
      totalHeight: 900,
      pageHeight: 901,
      numPages: 1,
    });
  });

  test("splits long documents into evenly-sized pages", () => {
    expect(computeScreenPdfLayout({ ...base, rawHeight: 30_000 })).toEqual({
      measuredHeight: 30_000,
      totalHeight: 30_000,
      pageHeight: 15_500,
      numPages: 2,
      clipped: false,
    });
  });

  test("clips documents above the total height cap", () => {
    expect(computeScreenPdfLayout({ ...base, rawHeight: 100_000 })).toEqual({
      measuredHeight: 100_000,
      totalHeight: 60_000,
      pageHeight: 15_500,
      numPages: 4,
      clipped: true,
    });
  });

  test("disables the per-page cap with 0", () => {
    expect(
      computeScreenPdfLayout({
        ...base,
        rawHeight: 100_000,
        maxPageHeightPx: 0,
      }),
    ).toMatchObject({
      totalHeight: 60_000,
      pageHeight: 60_001,
      numPages: 1,
      clipped: true,
    });
  });

  test("disables the total height cap with 0", () => {
    expect(
      computeScreenPdfLayout({
        ...base,
        rawHeight: 100_000,
        maxTotalHeightPx: 0,
      }),
    ).toMatchObject({
      totalHeight: 100_000,
      pageHeight: 17_167,
      numPages: 6,
      clipped: false,
    });
  });

  test("does not add a blank page when the document exactly fits", () => {
    expect(
      computeScreenPdfLayout({
        ...base,
        rawHeight: 19_200,
        maxPageHeightPx: 19_200,
      }),
    ).toMatchObject({
      totalHeight: 19_200,
      pageHeight: 19_201,
      numPages: 1,
    });
  });
});

describe("computeScreenPdfScrollTarget", () => {
  test("stops at the total height cap", () => {
    expect(
      computeScreenPdfScrollTarget({
        initialScrollHeight: 100_000,
        minHeight: 900,
        maxTotalHeightPx: 60_000,
      }),
    ).toBe(60_000);
  });

  test("uses the safety bound when the total cap is disabled", () => {
    expect(
      computeScreenPdfScrollTarget({
        initialScrollHeight: 100_000,
        minHeight: 900,
        maxTotalHeightPx: 0,
      }),
    ).toBe(SCREEN_PDF_SAFE_MAX_TOTAL_HEIGHT_PX);
  });

  test("does not scroll past a short document", () => {
    expect(
      computeScreenPdfScrollTarget({
        initialScrollHeight: 5_000,
        minHeight: 900,
        maxTotalHeightPx: 60_000,
      }),
    ).toBe(5_000);
  });

  test("still scrolls one viewport for very short documents", () => {
    expect(
      computeScreenPdfScrollTarget({
        initialScrollHeight: 100,
        minHeight: 900,
        maxTotalHeightPx: 60_000,
      }),
    ).toBe(900);
  });
});

describe("buildScreenPdfPageCss", () => {
  test("clips content only when the total cap applies", () => {
    const clipped = buildScreenPdfPageCss({
      measuredHeight: 100_000,
      totalHeight: 60_000,
      pageHeight: 15_000,
      numPages: 4,
      clipped: true,
    });
    expect(clipped).toContain("max-height: 60000px");
    expect(clipped).toContain("overflow: hidden");

    const unclipped = buildScreenPdfPageCss({
      measuredHeight: 5_000,
      totalHeight: 5_000,
      pageHeight: 5_001,
      numPages: 1,
      clipped: false,
    });
    expect(unclipped).not.toContain("max-height");
    expect(unclipped).toContain("@page");
  });
});
