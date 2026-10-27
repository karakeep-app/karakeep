import { z } from "zod";

import { PluginManager, PluginType } from "./plugins";

export const zBookmarkVectorDocument = z.object({
  id: z.string(),
  userId: z.string(),
  vectors: z.object({
    // Rich search profile (title, tags, note, domain, metadata, content
    // excerpt, ...). Used by semantic search and tag suggestions.
    search: z.array(z.number()),
    // Lean `Title + Summary` (or `Title + Content excerpt`) text, used for
    // similar-article lookups. Optional so index jobs enqueued by older
    // versions — which only computed the search vector — stay processable
    // after an upgrade.
    similar: z.array(z.number()).nullish(),
  }),
});

export type BookmarkVectorDocument = z.infer<typeof zBookmarkVectorDocument>;

export type VectorFilterableAttributes = "userId" | "id";
export type VectorFilterQuery =
  | {
      type: "eq";
      field: VectorFilterableAttributes;
      value: string;
    }
  | {
      type: "in";
      field: VectorFilterableAttributes;
      values: string[];
    };

export interface VectorSearchResult {
  id: string;
  score: number;
}

export interface VectorSearchOptions {
  vector: number[];
  // Different filters are ANDed together
  filter?: VectorFilterQuery[];
  limit?: number;
  // Drop hits whose ranking score is below this threshold (0..1)
  rankingScoreThreshold?: number;
}

export interface VectorSimilarSearchOptions {
  id: string;
  // Different filters are ANDed together
  filter?: VectorFilterQuery[];
  limit?: number;
  // Number of hits to skip. Combined with `limit`, this allows paginating
  // through the ranked neighbours.
  offset?: number;
  // Drop hits whose ranking score is below this threshold (0..1)
  rankingScoreThreshold?: number;
}

export interface VectorSearchResponse {
  hits: VectorSearchResult[];
  processingTimeMs: number;
}

export interface VectorStoreClient {
  /**
   * Add or update vectors in the vector store
   */
  addVectors(documents: BookmarkVectorDocument[]): Promise<void>;

  /**
   * Delete vectors by their IDs
   */
  deleteVectors(ids: string[]): Promise<void>;

  /**
   * Search for similar vectors. `options.vector` is expected to be an
   * embedding of the rich search profile (the "search"/"default" embedder).
   */
  search(options: VectorSearchOptions): Promise<VectorSearchResponse>;

  /**
   * Search for bookmarks similar to the passed bookmarkId
   */
  findSimilar(
    options: VectorSimilarSearchOptions,
  ): Promise<VectorSearchResponse>;

  /**
   * Clear all vectors from the index
   */
  clearIndex(): Promise<void>;

  /**
   * Get the vector store health
   */
  getHealth(): Promise<boolean>;
}

export async function getVectorStoreClient(): Promise<VectorStoreClient | null> {
  return PluginManager.getClient(PluginType.VectorStore);
}
