import type { Index } from "meilisearch";
import { Meilisearch } from "meilisearch";

import type {
  BookmarkVectorDocument,
  VectorFilterQuery,
  VectorSearchOptions,
  VectorSearchResponse,
  VectorStoreClient,
} from "@karakeep/shared/vectorStore";
import serverConfig from "@karakeep/shared/config";
import { PluginProvider } from "@karakeep/shared/plugins";

import { envConfig } from "./env";
import { BatchingDocumentQueue } from "../../lib/batchingDocumentQueue";

// Meilisearch document type that includes the vector field
interface MeiliVectorDocument {
  id: string;
  userId: string;
  _vectors: {
    default: unknown;
  };
}

function filterToMeiliSearchFilter(filter: VectorFilterQuery): string {
  switch (filter.type) {
    case "eq":
      return `${filter.field} = ${JSON.stringify(filter.value)}`;
    case "in":
      return `${filter.field} IN [${filter.values
        .map((v) => JSON.stringify(v))
        .join(",")}]`;
    default: {
      const exhaustiveCheck: never = filter;
      throw new Error(`Unhandled filter type: ${exhaustiveCheck}`);
    }
  }
}

class MeiliSearchVectorClient implements VectorStoreClient {
  private batchQueue: BatchingDocumentQueue<MeiliVectorDocument>;

  constructor(
    private index: Index<MeiliVectorDocument>,
    private client: Meilisearch,
    jobTimeoutSec: number,
    batchSize: number,
    batchTimeoutMs: number,
  ) {
    this.batchQueue = new BatchingDocumentQueue(
      index,
      jobTimeoutSec,
      batchSize,
      batchTimeoutMs,
      "meilisearch-vector",
    );
  }

  async addVectors(documents: BookmarkVectorDocument[]): Promise<void> {
    const meiliDocs: MeiliVectorDocument[] = documents.map((doc) => ({
      id: doc.id,
      userId: doc.userId,
      _vectors: {
        default: doc.vector,
      },
    }));

    await Promise.all(
      meiliDocs.map((document) => this.batchQueue.addDocument(document)),
    );
  }

  async deleteVectors(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.batchQueue.deleteDocument(id)));
  }

  async search(options: VectorSearchOptions): Promise<VectorSearchResponse> {
    const result = await this.index.search("", {
      vector: options.vector,
      hybrid: {
        semanticRatio: 1.0, // Pure vector search
        embedder: "default",
      },
      filter: options.filter?.map((f) => filterToMeiliSearchFilter(f)),
      limit: options.limit ?? 10,
      attributesToRetrieve: ["id"],
      showRankingScore: true,
    });

    return {
      hits: result.hits.map((hit) => ({
        id: hit.id,
        score: hit._rankingScore ?? 0,
      })),
      processingTimeMs: result.processingTimeMs,
    };
  }

  async clearIndex(): Promise<void> {
    const task = await this.index.deleteAllDocuments();
    await this.ensureTaskSuccess(task.taskUid);
  }

  private async ensureTaskSuccess(taskUid: number): Promise<void> {
    const task = await this.client.tasks.waitForTask(taskUid, {
      interval: 200,
      timeout: serverConfig.embedding.jobTimeoutSec * 1000 * 0.9,
    });
    if (task.error) {
      throw new Error(`Vector store task failed: ${task.error.message}`);
    }
  }
}

export class MeiliSearchVectorProvider implements PluginProvider<VectorStoreClient> {
  private client: Meilisearch | undefined;
  private version: string | undefined;
  private vectorClient: VectorStoreClient | undefined;
  private initPromise: Promise<VectorStoreClient | null> | undefined;
  private readonly indexName = "bookmarks_vectors";

  constructor() {
    if (MeiliSearchVectorProvider.isConfigured()) {
      this.client = new Meilisearch({
        host: envConfig.MEILI_ADDR!,
        apiKey: envConfig.MEILI_MASTER_KEY,
      });
    }
  }

  static isConfigured(): boolean {
    return !!envConfig.MEILI_ADDR;
  }

  async getClient(): Promise<VectorStoreClient | null> {
    if (this.vectorClient) {
      return this.vectorClient;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initClient();
    const client = await this.initPromise;
    this.initPromise = undefined;
    return client;
  }

  private async initClient(): Promise<VectorStoreClient | null> {
    if (!this.client) {
      return null;
    }

    this.version = (await this.client.getVersion()).pkgVersion;
    const versionParts = this.version.split(".");
    if (Number(versionParts[0]) < 1) {
      throw new Error(
        `Meilisearch version ${this.version[0]} is not supported. Please upgrade to v1.x.`,
      );
    } else if (Number(versionParts[1]) < 3) {
      console.warn(
        `[meilisearch-vector] Meilisearch version before v1.3.0 doesn't support embeddings. Please upgrade to v1.3.0 or later. You are using ${this.version}`,
      );
      return null;
    } else if (Number(versionParts[1]) < 13) {
      console.warn(
        `[meilisearch-vector] Meilisearch version before v1.13.0 didn't have the embeddings API stabilizied. Please upgrade to v1.13.0 or later. You are using ${this.version}`,
      );
      return null;
    } else if (Number(versionParts[1]) < 38) {
      console.warn(
        `[meilisearch-vector] Meilisearch version v1.38.0 introduced major vector speed improvements. Please upgrade to v1.38.0 or later to take advantage of these improvements. You are using ${this.version}`,
      );
    }

    const indices = await this.client.getIndexes();
    let indexFound = indices.results.find((i) => i.uid === this.indexName);

    if (!indexFound) {
      const idx = await this.client.createIndex(this.indexName, {
        primaryKey: "id",
      });
      await this.client.tasks.waitForTask(idx.taskUid);
      indexFound = await this.client.getIndex<MeiliVectorDocument>(
        this.indexName,
      );
    }

    await this.configureIndex(indexFound);
    this.vectorClient = new MeiliSearchVectorClient(
      indexFound,
      this.client,
      serverConfig.embedding.jobTimeoutSec,
      envConfig.MEILI_BATCH_SIZE,
      envConfig.MEILI_BATCH_TIMEOUT_MS,
    );
    return this.vectorClient;
  }

  private async configureIndex(
    index: Index<MeiliVectorDocument>,
  ): Promise<void> {
    const desiredFilterableAttributes = ["id", "userId"].sort();

    const settings = await index.getSettings();

    // Configure filterable attributes
    if (
      JSON.stringify(settings.filterableAttributes?.sort()) !==
      JSON.stringify(desiredFilterableAttributes)
    ) {
      console.log(
        `[meilisearch-vector] Updating filterable attributes to ${desiredFilterableAttributes} from ${settings.filterableAttributes}`,
      );
      const taskId = await index.updateFilterableAttributes(
        desiredFilterableAttributes,
      );
      await this.client!.tasks.waitForTask(taskId.taskUid);
    }

    // Configure embedders for vector search
    const currentEmbedders = settings.embedders;
    const desiredDimensions = serverConfig.embedding.dimensions;
    const currentEmbedder = currentEmbedders?.default;
    if (
      !currentEmbedder ||
      currentEmbedder.source != "userProvided" ||
      currentEmbedder.dimensions !== desiredDimensions
    ) {
      console.log(`[meilisearch-vector] Configuring user-provided embedder`);
      try {
        // Use userProvided embedder since we generate embeddings ourselves
        await index
          .updateEmbedders({
            default: {
              source: "userProvided",
              dimensions: desiredDimensions,
            },
          })
          .waitTask();
      } catch (error) {
        console.warn(
          `[meilisearch-vector] Failed to configure embedder. Vector search may not work: ${error}`,
        );
      }
    }
  }
}
