/**
 * Minimal union-find used to turn a similarity edge list into connected
 * components. Kept intentionally dependency-free so it stays trivially
 * unit-testable without a live Meilisearch/DB.
 */
class UnionFind {
  private parent = new Map<string, string>();

  private ensure(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
    }
    return x;
  }

  find(x: string): string {
    this.ensure(x);
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent.set(ra, rb);
    }
  }
}

export interface SimilarityEdge {
  bookmarkId: string;
  neighborId: string;
  score: number;
}

export interface BookmarkCluster {
  members: string[];
  /** Per-member average similarity to whichever kept edges touch it. */
  memberScores: Record<string, number>;
}

/**
 * Groups bookmarks into clusters using connected components over the
 * similarity edges that meet `threshold`, dropping components smaller than
 * `minClusterSize`. `bookmarkIds` is the full candidate set (so isolated
 * bookmarks with no surviving edges are correctly excluded rather than
 * silently forming singleton "clusters").
 */
export function clusterBySimilarity(
  bookmarkIds: string[],
  edges: SimilarityEdge[],
  opts: { threshold: number; minClusterSize: number },
): BookmarkCluster[] {
  const uf = new UnionFind();
  const idSet = new Set(bookmarkIds);
  for (const id of bookmarkIds) {
    uf.find(id);
  }

  const incidentScores = new Map<string, number[]>();
  const addScore = (id: string, score: number) => {
    const arr = incidentScores.get(id);
    if (arr) {
      arr.push(score);
    } else {
      incidentScores.set(id, [score]);
    }
  };

  for (const edge of edges) {
    if (edge.score < opts.threshold) {
      continue;
    }
    if (!idSet.has(edge.bookmarkId) || !idSet.has(edge.neighborId)) {
      continue;
    }
    uf.union(edge.bookmarkId, edge.neighborId);
    addScore(edge.bookmarkId, edge.score);
    addScore(edge.neighborId, edge.score);
  }

  const groups = new Map<string, string[]>();
  for (const id of bookmarkIds) {
    const root = uf.find(id);
    const group = groups.get(root);
    if (group) {
      group.push(id);
    } else {
      groups.set(root, [id]);
    }
  }

  const clusters: BookmarkCluster[] = [];
  for (const members of groups.values()) {
    if (members.length < opts.minClusterSize) {
      continue;
    }
    const memberScores: Record<string, number> = {};
    for (const id of members) {
      const scores = incidentScores.get(id) ?? [];
      memberScores[id] =
        scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0;
    }
    clusters.push({ members, memberScores });
  }

  return clusters;
}
