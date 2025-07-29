import { z } from "zod";

import { PluginManager, PluginType } from "./plugins";

export const zBookmarkSearchDocument = z.object({
  id: z.string(),
  userId: z.string(),
  url: z.string().nullish(),
  title: z.string().nullish(),
  linkTitle: z.string().nullish(),
  description: z.string().nullish(),
  content: z.string().nullish(),
  metadata: z.string().nullish(),
  fileName: z.string().nullish(),
  createdAt: z.string().nullish(),
  note: z.string().nullish(),
  summary: z.string().nullish(),
  tags: z.array(z.string()).default([]),
  publisher: z.string().nullish(),
  author: z.string().nullish(),
  datePublished: z.date().nullish(),
  dateModified: z.date().nullish(),
});

export type BookmarkSearchDocument = z.infer<typeof zBookmarkSearchDocument>;

export interface SearchResult {
  id: string;
  score?: number;
}

export interface SearchOptions {
  query: string;
  filter?: string[];
  limit?: number;
  offset?: number;
  sort?: string[];
}

export interface SearchResponse {
  hits: SearchResult[];
  totalHits: number;
  processingTimeMs: number;
}

export interface SearchIndexClient {
  addDocuments(documents: BookmarkSearchDocument[]): Promise<void>;
  updateDocuments(documents: BookmarkSearchDocument[]): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  deleteDocuments(ids: string[]): Promise<void>;
  search(options: SearchOptions): Promise<SearchResponse>;
  clearIndex(): Promise<void>;
}

export async function getSearchClient(): Promise<SearchIndexClient | null> {
  return PluginManager.getClient(PluginType.Search);
}
