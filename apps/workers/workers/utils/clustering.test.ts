import { describe, expect, test } from "vitest";

import { clusterBySimilarity, SimilarityEdge } from "./clustering";

describe("clusterBySimilarity", () => {
  test("groups bookmarks connected by edges at or above the threshold", () => {
    const ids = ["a", "b", "c", "d"];
    const edges: SimilarityEdge[] = [
      { bookmarkId: "a", neighborId: "b", score: 0.9 },
      { bookmarkId: "b", neighborId: "c", score: 0.8 },
      // d is isolated
    ];

    const clusters = clusterBySimilarity(ids, edges, {
      threshold: 0.75,
      minClusterSize: 2,
    });

    expect(clusters).toHaveLength(1);
    expect(clusters[0].members.sort()).toEqual(["a", "b", "c"]);
  });

  test("drops edges below the similarity threshold", () => {
    const ids = ["a", "b"];
    const edges: SimilarityEdge[] = [
      { bookmarkId: "a", neighborId: "b", score: 0.5 },
    ];

    const clusters = clusterBySimilarity(ids, edges, {
      threshold: 0.75,
      minClusterSize: 2,
    });

    expect(clusters).toHaveLength(0);
  });

  test("drops components smaller than minClusterSize", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const edges: SimilarityEdge[] = [
      // a-b form a pair, below the size-3 floor
      { bookmarkId: "a", neighborId: "b", score: 0.9 },
      // c-d-e form a trio, kept
      { bookmarkId: "c", neighborId: "d", score: 0.9 },
      { bookmarkId: "d", neighborId: "e", score: 0.85 },
    ];

    const clusters = clusterBySimilarity(ids, edges, {
      threshold: 0.75,
      minClusterSize: 3,
    });

    expect(clusters).toHaveLength(1);
    expect(clusters[0].members.sort()).toEqual(["c", "d", "e"]);
  });

  test("is transitive across chained edges (a-b, b-c implies one cluster)", () => {
    const ids = ["a", "b", "c"];
    const edges: SimilarityEdge[] = [
      { bookmarkId: "a", neighborId: "b", score: 0.8 },
      { bookmarkId: "b", neighborId: "c", score: 0.8 },
    ];

    const clusters = clusterBySimilarity(ids, edges, {
      threshold: 0.75,
      minClusterSize: 3,
    });

    expect(clusters).toHaveLength(1);
    expect(clusters[0].members.sort()).toEqual(["a", "b", "c"]);
  });

  test("computes each member's average incident similarity score", () => {
    const ids = ["a", "b", "c"];
    const edges: SimilarityEdge[] = [
      { bookmarkId: "a", neighborId: "b", score: 0.8 },
      { bookmarkId: "a", neighborId: "c", score: 1.0 },
      { bookmarkId: "b", neighborId: "c", score: 0.9 },
    ];

    const clusters = clusterBySimilarity(ids, edges, {
      threshold: 0.5,
      minClusterSize: 2,
    });

    expect(clusters).toHaveLength(1);
    // a is incident to two edges (0.8, 1.0) -> avg 0.9
    expect(clusters[0].memberScores["a"]).toBeCloseTo(0.9);
    // b is incident to two edges (0.8, 0.9) -> avg 0.85
    expect(clusters[0].memberScores["b"]).toBeCloseTo(0.85);
  });

  test("ignores edges referencing bookmarks outside the candidate set", () => {
    const ids = ["a", "b"];
    const edges: SimilarityEdge[] = [
      { bookmarkId: "a", neighborId: "z", score: 0.99 },
    ];

    const clusters = clusterBySimilarity(ids, edges, {
      threshold: 0.5,
      minClusterSize: 2,
    });

    expect(clusters).toHaveLength(0);
  });
});
