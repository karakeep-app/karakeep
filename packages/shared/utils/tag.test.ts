import { describe, expect, it } from "vitest";

import { filterToCuratedTags } from "./tag";

describe("filterToCuratedTags", () => {
  const curated = ["gaming", "investing", "machine-learning"];

  it("drops tags that are not on the curated list", () => {
    expect(
      filterToCuratedTags(
        ["collectors", "investing", "retro-games", "arbitrage"],
        curated,
      ),
    ).toEqual({
      kept: ["investing"],
      dropped: ["collectors", "retro-games", "arbitrage"],
    });
  });

  it("matches the way tag names are normalized", () => {
    expect(
      filterToCuratedTags(
        ["Machine Learning", "machine_learning", "GAMING"],
        curated,
      ),
    ).toEqual({ kept: ["machine-learning", "gaming"], dropped: [] });
  });

  it("returns the curated spelling, deduplicated", () => {
    expect(
      filterToCuratedTags(["Investing", "investing", "in-vesting"], curated)
        .kept,
    ).toEqual(["investing"]);
  });

  it("drops everything when nothing is on the list", () => {
    expect(filterToCuratedTags(["arbitrage"], curated)).toEqual({
      kept: [],
      dropped: ["arbitrage"],
    });
  });

  it("keeps nothing for an empty inference", () => {
    expect(filterToCuratedTags([], curated)).toEqual({
      kept: [],
      dropped: [],
    });
  });
});
