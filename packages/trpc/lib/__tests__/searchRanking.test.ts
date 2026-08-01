import { describe, expect, test } from "vitest";

import { reciprocalRankFusion } from "../searchRanking";

describe("reciprocalRankFusion", () => {
  test("rewards results returned by both search engines", () => {
    const results = reciprocalRankFusion([
      [{ id: "fts-only" }, { id: "both" }],
      [{ id: "semantic-only" }, { id: "both" }],
    ]);

    expect(results.map((result) => result.id)).toEqual([
      "both",
      "fts-only",
      "semantic-only",
    ]);
  });

  test("keeps source order when only one list contains a result", () => {
    const results = reciprocalRankFusion([
      [{ id: "first" }, { id: "second" }, { id: "third" }],
      [],
    ]);

    expect(results.map((result) => result.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  test("counts duplicate ids only once per source", () => {
    const results = reciprocalRankFusion(
      [[{ id: "duplicate" }, { id: "duplicate" }], [{ id: "other" }]],
      0,
    );

    expect(results).toEqual([
      { id: "duplicate", score: 1 },
      { id: "other", score: 1 },
    ]);
  });
});
