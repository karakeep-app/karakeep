import type { Index } from "meilisearch";
import { MeiliSearch } from "meilisearch";

import type {
  BookmarkSearchDocument,
  FilterQuery,
  IndexingOptions,
  SearchIndexClient,
  SearchOptions,
  SearchResponse,
} from "@karakeep/shared/search";
import serverConfig from "@karakeep/shared/config";
import { PluginProvider } from "@karakeep/shared/plugins";

import { envConfig } from "./env";
import { BatchingDocumentQueue } from "../../lib/batchingDocumentQueue";

function filterToMeiliSearchFilter(filter: FilterQuery): string {
  switch (filter.type) {
    case "eq":
      return `${filter.field} = "${filter.value}"`;
    case "in":
      return `${filter.field} IN [${filter.values.join(",")}]`;
    default: {
      const exhaustiveCheck: never = filter;
      throw new Error(`Unhandled color case: ${exhaustiveCheck}`);
    }
  }
}

class MeiliSearchIndexClient implements SearchIndexClient {
  private batchQueue: BatchingDocumentQueue<BookmarkSearchDocument>;
  private jobTimeoutSec: number;

  constructor(
    private index: Index<BookmarkSearchDocument>,
    jobTimeoutSec: number,
    batchSize: number,
    batchTimeoutMs: number,
  ) {
    this.jobTimeoutSec = jobTimeoutSec;
    this.batchQueue = new BatchingDocumentQueue(
      index,
      jobTimeoutSec,
      batchSize,
      batchTimeoutMs,
      "meilisearch",
    );
  }

  async addDocuments(
    documents: BookmarkSearchDocument[],
    options?: IndexingOptions,
  ): Promise<void> {
    const shouldBatch = options?.batch !== false;

    if (shouldBatch) {
      await Promise.all(
        documents.map((doc) => this.batchQueue.addDocument(doc)),
      );
    } else {
      // Direct indexing without batching
      const task = await this.index.addDocuments(documents, {
        primaryKey: "id",
      });
      await this.ensureTaskSuccess(task.taskUid);
    }
  }

  async deleteDocuments(
    ids: string[],
    options?: IndexingOptions,
  ): Promise<void> {
    const shouldBatch = options?.batch !== false;

    if (shouldBatch) {
      await Promise.all(ids.map((id) => this.batchQueue.deleteDocument(id)));
    } else {
      // Direct deletion without batching
      const task = await this.index.deleteDocuments(ids);
      await this.ensureTaskSuccess(task.taskUid);
    }
  }

  async search(options: SearchOptions): Promise<SearchResponse> {
    const result = await this.index.search(options.query, {
      filter: options.filter?.map((f) => filterToMeiliSearchFilter(f)),
      limit: options.limit,
      offset: options.offset,
      sort: options.sort?.map((s) => `${s.field}:${s.order}`),
      attributesToRetrieve: ["id"],
      showRankingScore: true,
      matchingStrategy: "all",
    });

    return {
      hits: result.hits.map((hit) => ({
        id: hit.id,
        score: hit._rankingScore,
      })),
      totalHits: result.estimatedTotalHits ?? 0,
      processingTimeMs: result.processingTimeMs,
    };
  }

  async clearIndex(): Promise<void> {
    const task = await this.index.deleteAllDocuments();
    await this.ensureTaskSuccess(task.taskUid);
  }

  private async ensureTaskSuccess(taskUid: number): Promise<void> {
    const task = await this.index.waitForTask(taskUid, {
      intervalMs: 200,
      timeOutMs: this.jobTimeoutSec * 1000 * 0.9,
    });
    if (task.error) {
      throw new Error(`Search task failed: ${task.error.message}`);
    }
  }
}

export class MeiliSearchProvider implements PluginProvider<SearchIndexClient> {
  private client: MeiliSearch | undefined;
  private indexClient: SearchIndexClient | undefined;
  private initPromise: Promise<SearchIndexClient | null> | undefined;
  private readonly indexName = "bookmarks";

  constructor() {
    if (MeiliSearchProvider.isConfigured()) {
      this.client = new MeiliSearch({
        host: envConfig.MEILI_ADDR!,
        apiKey: envConfig.MEILI_MASTER_KEY,
      });
    }
  }

  static isConfigured(): boolean {
    return !!envConfig.MEILI_ADDR;
  }

  async getClient(): Promise<SearchIndexClient | null> {
    if (this.indexClient) {
      return this.indexClient;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initClient();
    const client = await this.initPromise;
    this.initPromise = undefined;
    return client;
  }

  private async initClient(): Promise<SearchIndexClient | null> {
    if (!this.client) {
      return null;
    }

    const indices = await this.client.getIndexes();
    let indexFound = indices.results.find((i) => i.uid === this.indexName);

    if (!indexFound) {
      const idx = await this.client.createIndex(this.indexName, {
        primaryKey: "id",
      });
      await this.client.waitForTask(idx.taskUid);
      indexFound = await this.client.getIndex<BookmarkSearchDocument>(
        this.indexName,
      );
    }

    await this.configureIndex(indexFound);
    this.indexClient = new MeiliSearchIndexClient(
      indexFound,
      serverConfig.search.jobTimeoutSec,
      envConfig.MEILI_BATCH_SIZE,
      envConfig.MEILI_BATCH_TIMEOUT_MS,
    );
    return this.indexClient;
  }

  private async configureIndex(
    index: Index<BookmarkSearchDocument>,
  ): Promise<void> {
    const desiredFilterableAttributes = ["id", "userId"].sort();
    const desiredSortableAttributes = ["createdAt"].sort();

    const settings = await index.getSettings();

    if (
      JSON.stringify(settings.filterableAttributes?.sort()) !==
      JSON.stringify(desiredFilterableAttributes)
    ) {
      console.log(
        `[meilisearch] Updating desired filterable attributes to ${desiredFilterableAttributes} from ${settings.filterableAttributes}`,
      );
      const taskId = await index.updateFilterableAttributes(
        desiredFilterableAttributes,
      );
      await this.client!.waitForTask(taskId.taskUid);
    }

    if (
      JSON.stringify(settings.sortableAttributes?.sort()) !==
      JSON.stringify(desiredSortableAttributes)
    ) {
      console.log(
        `[meilisearch] Updating desired sortable attributes to ${desiredSortableAttributes} from ${settings.sortableAttributes}`,
      );
      const taskId = await index.updateSortableAttributes(
        desiredSortableAttributes,
      );
      await this.client!.waitForTask(taskId.taskUid);
    }
  }
}
