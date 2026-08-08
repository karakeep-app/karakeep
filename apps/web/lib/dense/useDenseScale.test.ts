import { describe, expect, it } from "vitest";

import { computeAutoScale, MAX_SCALE, MIN_SCALE } from "./useDenseScale";

describe("computeAutoScale", () => {
  it("is 1 at the design's own frame size", () => {
    expect(computeAutoScale(1000, 625)).toBe(1);
  });

  it("follows the more constrained axis so the 16:10 framing survives", () => {
    // Very wide but short: height is the limit, not width.
    expect(computeAutoScale(4000, 625)).toBe(1);
  });

  it("clamps below MIN_SCALE on small viewports", () => {
    expect(computeAutoScale(320, 480)).toBe(MIN_SCALE);
  });

  it("clamps above MAX_SCALE on very large viewports", () => {
    expect(computeAutoScale(8000, 5000)).toBe(MAX_SCALE);
  });
});
