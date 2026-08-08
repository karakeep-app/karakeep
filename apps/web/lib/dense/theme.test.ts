import { describe, expect, it } from "vitest";

import { ACCENTS, topicColorsFor } from "./theme";

describe("topicColorsFor", () => {
  it("always leads with the active accent", () => {
    for (const a of ACCENTS) {
      expect(topicColorsFor(a.id)[0]).toBe(a.hex);
    }
  });

  it("returns three distinct colours", () => {
    for (const a of ACCENTS) {
      const colors = topicColorsFor(a.id);
      expect(colors).toHaveLength(3);
      expect(new Set(colors).size).toBe(3);
    }
  });

  it("wraps around the accent list", () => {
    // "blue" is last in ACCENTS, so its companions should wrap back to
    // the front (mint, violet) rather than running off the end.
    expect(topicColorsFor("blue")).toEqual([
      ACCENTS[3].hex,
      ACCENTS[0].hex,
      ACCENTS[1].hex,
    ]);
  });
});
