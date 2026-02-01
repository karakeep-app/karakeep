import type { Index } from "meilisearch";
import { Mutex } from "async-mutex";
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

type PendingOperation =
  | {
      type: "add";
      document: BookmarkSearchDocument;
      resolve: () => void;
      reject: (error: Error) => void;
    }
  | {
      type: "delete";
      id: string;
      resolve: () => void;
      reject: (error: Error) => void;
    };

class BatchingDocumentQueue {
  private pendingOperations: PendingOperation[] = [];
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;
  private mutex = new Mutex();

  constructor(
    private index: Index<BookmarkSearchDocument>,
    private jobTimeoutSec: number,
    private batchSize: number,
    private batchTimeoutMs: number,
  ) {}

  async addDocument(document: BookmarkSearchDocument): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pendingOperations.push({ type: "add", document, resolve, reject });
      this.scheduleFlush();

      if (this.pendingOperations.length >= this.batchSize) {
        void this.flush();
      }
    });
  }

  async deleteDocument(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pendingOperations.push({ type: "delete", id, resolve, reject });
      this.scheduleFlush();

      if (this.pendingOperations.length >= this.batchSize) {
        void this.flush();
      }
    });
  }

  private scheduleFlush(): void {
    if (this.flushTimeout === null) {
      this.flushTimeout = setTimeout(() => {
        void this.flush();
      }, this.batchTimeoutMs);
    }
  }

  private async flush(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (this.flushTimeout) {
        clearTimeout(this.flushTimeout);
        this.flushTimeout = null;
      }

      // Process operations in order, batching consecutive operations of the same type
      while (this.pendingOperations.length > 0) {
        const currentType = this.pendingOperations[0].type;

        // Collect consecutive operations of the same type (up to batchSize)
        const batch: PendingOperation[] = [];
        while (
          batch.length < this.batchSize &&
          this.pendingOperations.length > 0 &&
          this.pendingOperations[0].type === currentType
        ) {
          batch.push(this.pendingOperations.shift()!);
        }

        if (currentType === "add") {
          await this.flushAddBatch(
            batch as Extract<PendingOperation, { type: "add" }>[],
          );
        } else {
          await this.flushDeleteBatch(
            batch as Extract<PendingOperation, { type: "delete" }>[],
          );
        }
      }
    });
  }

  private async flushAddBatch(
    batch: Extract<PendingOperation, { type: "add" }>[],
  ): Promise<void> {
    if (batch.length === 0) return;

    try {
      const documents = batch.map((p) => p.document);
      const task = await this.index.addDocuments(documents, {
        primaryKey: "id",
      });
      await this.ensureTaskSuccess(task.taskUid);
      batch.forEach((p) => p.resolve());
    } catch (error) {
      batch.forEach((p) => p.reject(error as Error));
    }
  }

  private async flushDeleteBatch(
    batch: Extract<PendingOperation, { type: "delete" }>[],
  ): Promise<void> {
    if (batch.length === 0) return;

    try {
      const ids = batch.map((p) => p.id);
      const task = await this.index.deleteDocuments(ids);
      await this.ensureTaskSuccess(task.taskUid);
      batch.forEach((p) => p.resolve());
    } catch (error) {
      batch.forEach((p) => p.reject(error as Error));
    }
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

class MeiliSearchIndexClient implements SearchIndexClient {
  private batchQueue: BatchingDocumentQueue;
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
