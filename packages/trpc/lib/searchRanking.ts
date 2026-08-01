export interface RankedSearchHit {
  id: string;
  score: number;
}

/**
 * Merge ranked result lists using reciprocal-rank fusion (RRF).
 *
 * RRF deliberately ignores source scores because full-text and vector search
 * scores do not share a meaningful scale. A hit receives credit for its rank
 * in every source, so results returned by both sources naturally rise.
 */
export function reciprocalRankFusion(
  resultLists: readonly (readonly { id: string }[])[],
  rankConstant = 60,
): RankedSearchHit[] {
  const scores = new Map<string, { score: number; bestRank: number }>();

  for (const hits of resultLists) {
    const seen = new Set<string>();
    hits.forEach((hit, index) => {
      if (seen.has(hit.id)) {
        return;
      }
      seen.add(hit.id);

      const rank = index + 1;
      const current = scores.get(hit.id) ?? {
        score: 0,
        bestRank: Number.POSITIVE_INFINITY,
      };
      current.score += 1 / (rankConstant + rank);
      current.bestRank = Math.min(current.bestRank, rank);
      scores.set(hit.id, current);
    });
  }

  return [...scores.entries()]
    .map(([id, ranking]) => ({ id, ...ranking }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.bestRank - b.bestRank ||
        a.id.localeCompare(b.id),
    )
    .map(({ id, score }) => ({ id, score }));
}
