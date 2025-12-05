import {
  and,
  asc,
  desc,
  eq,
  inArray,
  like,
  or,
  type SQL,
} from "drizzle-orm";
import { db } from "@karakeep/db";
import {
  bookmarkAssets,
  bookmarkLinks,
  bookmarks,
  bookmarkTexts,
  bookmarkTags,
  tagsOnBookmarks,
} from "@karakeep/db/schema";
import type {
  BookmarkSearchDocument,
  SearchIndexClient,
  SearchOptions,
  SearchResponse,
  FilterQuery,
} from "@karakeep/shared/search";
import type { PluginProvider } from "@karakeep/shared/plugins";

/**
 * Database-based search implementation using LIKE queries.
 * This is a fallback search plugin for when Meilisearch is not configured.
 */
export class DBSearchIndexClient implements SearchIndexClient {
  /**
   * No-op: Data is already in the database
   */
  async addDocuments(_documents: BookmarkSearchDocument[]): Promise<void> {
    // Do nothing - data is already in the DB
  }

  /**
   * No-op: Data deletion is handled by the database cascade deletes
   */
  async deleteDocuments(_ids: string[]): Promise<void> {
    // Do nothing - deletion is handled by the DB
  }

  /**
   * Search bookmarks using LIKE queries across multiple fields
   */
  async search(options: SearchOptions): Promise<SearchResponse> {
    const startTime = Date.now();
    const { query, filter, sort, limit = 50, offset = 0 } = options;

    // Build the WHERE clause from filters
    const filterConditions: SQL[] = [];

    if (filter) {
      for (const f of filter) {
        switch (f.type) {
          case "eq":
            if (f.field === "userId") {
              filterConditions.push(eq(bookmarks.userId, f.value));
            } else if (f.field === "id") {
              filterConditions.push(eq(bookmarks.id, f.value));
            }
            break;
          case "in":
            if (f.field === "userId") {
              filterConditions.push(inArray(bookmarks.userId, f.values));
            } else if (f.field === "id") {
              filterConditions.push(inArray(bookmarks.id, f.values));
            }
            break;
        }
      }
    }

    // Build search conditions for text query
    if (query && query.trim()) {
      const searchPattern = `%${query.trim()}%`;

      // First, search in the bookmarks table itself
      const bookmarkSearchConditions: SQL[] = [
        like(bookmarks.title, searchPattern),
        like(bookmarks.note, searchPattern),
        like(bookmarks.summary, searchPattern),
      ];

      const whereClause =
        filterConditions.length > 0
          ? and(...filterConditions, or(...bookmarkSearchConditions))
          : or(...bookmarkSearchConditions);

      // Build the ORDER BY clause
      let orderByClause;
      if (sort && sort.length > 0) {
        const sortField = sort[0];
        if (sortField.field === "createdAt") {
          orderByClause =
            sortField.order === "asc"
              ? asc(bookmarks.createdAt)
              : desc(bookmarks.createdAt);
        }
      }
      if (!orderByClause) {
        orderByClause = desc(bookmarks.createdAt);
      }

      // Get bookmark IDs from main search
      const mainResults = await db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(whereClause)
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset);

      let allBookmarkIds = mainResults.map((r: { id: string }) => r.id);

      // Also search in related tables if we have a query
      // Search in bookmarkLinks
      const linkResults = await db
        .select({ id: bookmarkLinks.id })
        .from(bookmarkLinks)
        .innerJoin(bookmarks, eq(bookmarks.id, bookmarkLinks.id))
        .where(
          and(
            filterConditions.length > 0
              ? and(...filterConditions)
              : undefined,
            or(
              like(bookmarkLinks.url, searchPattern),
              like(bookmarkLinks.title, searchPattern),
              like(bookmarkLinks.description, searchPattern),
              like(bookmarkLinks.author, searchPattern),
              like(bookmarkLinks.publisher, searchPattern),
            ),
          ),
        )
        .limit(limit);

      // Search in bookmarkTexts
      const textResults = await db
        .select({ id: bookmarkTexts.id })
        .from(bookmarkTexts)
        .innerJoin(bookmarks, eq(bookmarks.id, bookmarkTexts.id))
        .where(
          and(
            filterConditions.length > 0
              ? and(...filterConditions)
              : undefined,
            like(bookmarkTexts.text, searchPattern),
          ),
        )
        .limit(limit);

      // Search in bookmarkAssets
      const assetResults = await db
        .select({ id: bookmarkAssets.id })
        .from(bookmarkAssets)
        .innerJoin(bookmarks, eq(bookmarks.id, bookmarkAssets.id))
        .where(
          and(
            filterConditions.length > 0
              ? and(...filterConditions)
              : undefined,
            or(
              like(bookmarkAssets.content, searchPattern),
              like(bookmarkAssets.metadata, searchPattern),
              like(bookmarkAssets.fileName, searchPattern),
            ),
          ),
        )
        .limit(limit);

      // Search in tags
      const tagResults = await db
        .select({ bookmarkId: tagsOnBookmarks.bookmarkId })
        .from(tagsOnBookmarks)
        .innerJoin(bookmarkTags, eq(bookmarkTags.id, tagsOnBookmarks.tagId))
        .innerJoin(bookmarks, eq(bookmarks.id, tagsOnBookmarks.bookmarkId))
        .where(
          and(
            filterConditions.length > 0
              ? and(...filterConditions)
              : undefined,
            like(bookmarkTags.name, searchPattern),
          ),
        )
        .limit(limit);

      // Combine all bookmark IDs from different sources
      allBookmarkIds = [
        ...allBookmarkIds,
        ...linkResults.map((r: { id: string }) => r.id),
        ...textResults.map((r: { id: string }) => r.id),
        ...assetResults.map((r: { id: string }) => r.id),
        ...tagResults.map((r: { bookmarkId: string }) => r.bookmarkId),
      ];

      // Remove duplicates and apply limit/offset
      const uniqueIds = [...new Set(allBookmarkIds)];
      const paginatedIds = uniqueIds.slice(offset, offset + limit);

      const processingTimeMs = Date.now() - startTime;

      return {
        hits: paginatedIds.map((id) => ({
          id,
          score: 1, // No relevance scoring for DB search
        })),
        totalHits: uniqueIds.length,
        processingTimeMs,
      };
    } else {
      // No query, just apply filters
      const whereClause =
        filterConditions.length > 0 ? and(...filterConditions) : undefined;

      // Build the ORDER BY clause
      let orderByClause;
      if (sort && sort.length > 0) {
        const sortField = sort[0];
        if (sortField.field === "createdAt") {
          orderByClause =
            sortField.order === "asc"
              ? asc(bookmarks.createdAt)
              : desc(bookmarks.createdAt);
        }
      }
      if (!orderByClause) {
        orderByClause = desc(bookmarks.createdAt);
      }

      // Execute the query
      const results = await db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(whereClause)
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset);

      // Get total count
      const countResults = await db
        .select({ count: bookmarks.id })
        .from(bookmarks)
        .where(whereClause);

      const processingTimeMs = Date.now() - startTime;

      return {
        hits: results.map((r: { id: string }) => ({
          id: r.id,
          score: 1,
        })),
        totalHits: countResults.length,
        processingTimeMs,
      };
    }
  }

  /**
   * No-op: Index doesn't need to be cleared for DB search
   */
  async clearIndex(): Promise<void> {
    // Do nothing - no index to clear
  }
}

/**
 * Provider for the database search plugin
 */
export class DBSearchProvider implements PluginProvider<SearchIndexClient> {
  private indexClient: SearchIndexClient | undefined;

  /**
   * DB search is always available (no configuration needed)
   */
  static isConfigured(): boolean {
    return true;
  }

  async getClient(): Promise<SearchIndexClient | null> {
    if (!this.indexClient) {
      this.indexClient = new DBSearchIndexClient();
    }
    return this.indexClient;
  }
}
