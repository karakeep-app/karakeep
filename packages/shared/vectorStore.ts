import { z } from "zod";

import { PluginManager, PluginType } from "./plugins";

export const zBookmarkVectorDocument = z.object({
  id: z.string(),
  userId: z.string(),
  vector: z.array(z.number()),
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
   * Search for similar vectors
   */
  search(options: VectorSearchOptions): Promise<VectorSearchResponse>;

  /**
   * Clear all vectors from the index
   */
  clearIndex(): Promise<void>;
}

export async function getVectorStoreClient(): Promise<VectorStoreClient | null> {
  return PluginManager.getClient(PluginType.VectorStore);
}
