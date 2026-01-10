import type { Index } from "meilisearch";
import { Mutex } from "async-mutex";
import { MeiliSearch } from "meilisearch";

import type {
  BookmarkSearchDocument,
  FilterQuery,
  SearchIndexClient,
  SearchOptions,
  SearchResponse,
} from "@karakeep/shared/search";
import serverConfig from "@karakeep/shared/config";
import { PluginProvider } from "@karakeep/shared/plugins";

import { envConfig } from "./env";

const BATCH_SIZE = 50;
const BATCH_TIMEOUT_MS = 500;

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

interface PendingAddDocument {
  document: BookmarkSearchDocument;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface PendingDeleteDocument {
  id: string;
  resolve: () => void;
  reject: (error: Error) => void;
}

class BatchingDocumentQueue {
  private pendingAdds: PendingAddDocument[] = [];
  private pendingDeletes: PendingDeleteDocument[] = [];
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;
  private mutex = new Mutex();

  constructor(
    private index: Index<BookmarkSearchDocument>,
    private jobTimeoutSec: number,
  ) {}

  async addDocument(document: BookmarkSearchDocument): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pendingAdds.push({ document, resolve, reject });
      this.scheduleFlush();

      if (this.pendingAdds.length >= BATCH_SIZE) {
        void this.flush();
      }
    });
  }

  async deleteDocument(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pendingDeletes.push({ id, resolve, reject });
      this.scheduleFlush();

      if (this.pendingDeletes.length >= BATCH_SIZE) {
        void this.flush();
      }
    });
  }

  private scheduleFlush(): void {
    if (this.flushTimeout === null) {
      this.flushTimeout = setTimeout(() => {
        void this.flush();
      }, BATCH_TIMEOUT_MS);
    }
  }

  private async flush(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (this.flushTimeout) {
        clearTimeout(this.flushTimeout);
        this.flushTimeout = null;
      }

      // Flush pending adds
      while (this.pendingAdds.length > 0) {
        const batch = this.pendingAdds.splice(0, BATCH_SIZE);
        await this.flushAddBatch(batch);
      }

      // Flush pending deletes
      while (this.pendingDeletes.length > 0) {
        const batch = this.pendingDeletes.splice(0, BATCH_SIZE);
        await this.flushDeleteBatch(batch);
      }
    });
  }

  private async flushAddBatch(batch: PendingAddDocument[]): Promise<void> {
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
    batch: PendingDeleteDocument[],
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

  constructor(
    private index: Index<BookmarkSearchDocument>,
    jobTimeoutSec: number,
  ) {
    this.batchQueue = new BatchingDocumentQueue(index, jobTimeoutSec);
  }

  async addDocuments(documents: BookmarkSearchDocument[]): Promise<void> {
    await Promise.all(documents.map((doc) => this.batchQueue.addDocument(doc)));
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.batchQueue.deleteDocument(id)));
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
      timeOutMs: serverConfig.search.jobTimeoutSec * 1000 * 0.9,
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
