import {
  and,
  asc,
  desc,
  eq,
  inArray,
  like,
  or,
  sql,
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

    // Build filter conditions for WHERE clauses
    const buildFilterConditions = (): SQL | undefined => {
      if (!filter || filter.length === 0) return undefined;

      const conditions: SQL[] = [];
      for (const f of filter) {
        switch (f.type) {
          case "eq":
            if (f.field === "userId") {
              conditions.push(eq(bookmarks.userId, f.value));
            } else if (f.field === "id") {
              conditions.push(eq(bookmarks.id, f.value));
            }
            break;
          case "in":
            if (f.field === "userId") {
              conditions.push(inArray(bookmarks.userId, f.values));
            } else if (f.field === "id") {
              conditions.push(inArray(bookmarks.id, f.values));
            }
            break;
        }
      }
      return conditions.length > 0 ? and(...conditions) : undefined;
    };

    const filterConditions = buildFilterConditions();

    // Determine sort order
    const sortOrder =
      sort && sort.length > 0 && sort[0].order === "asc" ? "ASC" : "DESC";

    if (query && query.trim()) {
      const searchPattern = `%${query.trim()}%`;

      // Build filter clauses for each UNION part
      const buildFilterSql = (tableAlias: string): SQL | undefined => {
        if (!filter || filter.length === 0) return undefined;

        const conditions: SQL[] = [];
        for (const f of filter) {
          if (f.type === "eq") {
            if (f.field === "userId") {
              conditions.push(sql`${sql.raw(`${tableAlias}.userId`)} = ${f.value}`);
            } else if (f.field === "id") {
              conditions.push(sql`${sql.raw(`${tableAlias}.id`)} = ${f.value}`);
            }
          } else if (f.type === "in") {
            if (f.field === "userId") {
              conditions.push(sql`${sql.raw(`${tableAlias}.userId`)} IN ${f.values}`);
            } else if (f.field === "id") {
              conditions.push(sql`${sql.raw(`${tableAlias}.id`)} IN ${f.values}`);
            }
          }
        }
        return conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;
      };

      const filterSql = buildFilterSql("b");
      const filterClause = filterSql ? sql` AND ${filterSql}` : sql``;

      // Execute a single UNION query to search across all tables
      const unionQuery = sql`
        SELECT DISTINCT b.id, b.createdAt
        FROM bookmarks b
        WHERE (
          b.title LIKE ${searchPattern} OR
          b.note LIKE ${searchPattern} OR
          b.summary LIKE ${searchPattern}
        )${filterClause}

        UNION

        SELECT DISTINCT b.id, b.createdAt
        FROM bookmarks b
        INNER JOIN bookmarkLinks bl ON b.id = bl.id
        WHERE (
          bl.url LIKE ${searchPattern} OR
          bl.title LIKE ${searchPattern} OR
          bl.description LIKE ${searchPattern} OR
          bl.author LIKE ${searchPattern} OR
          bl.publisher LIKE ${searchPattern}
        )${filterClause}

        UNION

        SELECT DISTINCT b.id, b.createdAt
        FROM bookmarks b
        INNER JOIN bookmarkTexts bt ON b.id = bt.id
        WHERE bt.text LIKE ${searchPattern}${filterClause}

        UNION

        SELECT DISTINCT b.id, b.createdAt
        FROM bookmarks b
        INNER JOIN bookmarkAssets ba ON b.id = ba.id
        WHERE (
          ba.content LIKE ${searchPattern} OR
          ba.metadata LIKE ${searchPattern} OR
          ba.fileName LIKE ${searchPattern}
        )${filterClause}

        UNION

        SELECT DISTINCT b.id, b.createdAt
        FROM bookmarks b
        INNER JOIN tagsOnBookmarks tob ON b.id = tob.bookmarkId
        INNER JOIN bookmarkTags bt ON tob.tagId = bt.id
        WHERE bt.name LIKE ${searchPattern}${filterClause}

        ORDER BY createdAt ${sql.raw(sortOrder)}
        LIMIT ${limit} OFFSET ${offset}
      `;

      const results = (await db.all(unionQuery)) as { id: string; createdAt: number }[];

      // Get total count
      const countQuery = sql`
        SELECT COUNT(*) as total FROM (
          SELECT DISTINCT b.id
          FROM bookmarks b
          WHERE (
            b.title LIKE ${searchPattern} OR
            b.note LIKE ${searchPattern} OR
            b.summary LIKE ${searchPattern}
          )${filterClause}

          UNION

          SELECT DISTINCT b.id
          FROM bookmarks b
          INNER JOIN bookmarkLinks bl ON b.id = bl.id
          WHERE (
            bl.url LIKE ${searchPattern} OR
            bl.title LIKE ${searchPattern} OR
            bl.description LIKE ${searchPattern} OR
            bl.author LIKE ${searchPattern} OR
            bl.publisher LIKE ${searchPattern}
          )${filterClause}

          UNION

          SELECT DISTINCT b.id
          FROM bookmarks b
          INNER JOIN bookmarkTexts bt ON b.id = bt.id
          WHERE bt.text LIKE ${searchPattern}${filterClause}

          UNION

          SELECT DISTINCT b.id
          FROM bookmarks b
          INNER JOIN bookmarkAssets ba ON b.id = ba.id
          WHERE (
            ba.content LIKE ${searchPattern} OR
            ba.metadata LIKE ${searchPattern} OR
            ba.fileName LIKE ${searchPattern}
          )${filterClause}

          UNION

          SELECT DISTINCT b.id
          FROM bookmarks b
          INNER JOIN tagsOnBookmarks tob ON b.id = tob.bookmarkId
          INNER JOIN bookmarkTags bt ON tob.tagId = bt.id
          WHERE bt.name LIKE ${searchPattern}${filterClause}
        )
      `;

      const countResult = (await db.get(countQuery)) as { total: number } | undefined;

      const processingTimeMs = Date.now() - startTime;

      return {
        hits: results.map((r) => ({
          id: r.id,
          score: 1, // No relevance scoring for DB search
        })),
        totalHits: countResult?.total ?? 0,
        processingTimeMs,
      };
    } else {
      // No query, just apply filters
      const whereClause = filterConditions;

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
