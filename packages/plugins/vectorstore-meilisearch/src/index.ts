import type { Index } from "meilisearch";
import { MeiliSearch } from "meilisearch";

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

// Meilisearch document type that includes the vector field
interface MeiliVectorDocument {
  id: string;
  userId: string;
  _vectors: {
    default: number[];
  };
}

function filterToMeiliSearchFilter(filter: VectorFilterQuery): string {
  switch (filter.type) {
    case "eq":
      return `${filter.field} = "${filter.value}"`;
    case "in":
      return `${filter.field} IN [${filter.values.join(",")}]`;
    default: {
      const exhaustiveCheck: never = filter;
      throw new Error(`Unhandled filter type: ${exhaustiveCheck}`);
    }
  }
}

class MeiliSearchVectorClient implements VectorStoreClient {
  constructor(
    private index: Index<MeiliVectorDocument>,
    private client: MeiliSearch,
  ) {}

  async addVectors(documents: BookmarkVectorDocument[]): Promise<void> {
    const meiliDocs: MeiliVectorDocument[] = documents.map((doc) => ({
      id: doc.id,
      userId: doc.userId,
      _vectors: {
        default: doc.vector,
      },
    }));

    const task = await this.index.addDocuments(meiliDocs, {
      primaryKey: "id",
    });
    await this.ensureTaskSuccess(task.taskUid);
  }

  async deleteVectors(ids: string[]): Promise<void> {
    const task = await this.index.deleteDocuments(ids);
    await this.ensureTaskSuccess(task.taskUid);
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
    const task = await this.client.waitForTask(taskUid, {
      intervalMs: 200,
      timeOutMs: serverConfig.search.jobTimeoutSec * 1000 * 0.9,
    });
    if (task.error) {
      throw new Error(`Vector store task failed: ${task.error.message}`);
    }
  }
}

export class MeiliSearchVectorProvider
  implements PluginProvider<VectorStoreClient>
{
  private client: MeiliSearch | undefined;
  private vectorClient: VectorStoreClient | undefined;
  private readonly indexName = "bookmarks_vectors";

  constructor() {
    if (MeiliSearchVectorProvider.isConfigured()) {
      this.client = new MeiliSearch({
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
      indexFound = await this.client.getIndex<MeiliVectorDocument>(
        this.indexName,
      );
    }

    await this.configureIndex(indexFound);
    this.vectorClient = new MeiliSearchVectorClient(indexFound, this.client);
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
      await this.client!.waitForTask(taskId.taskUid);
    }

    // Configure embedders for vector search
    // Note: This requires Meilisearch v1.3+ with vector search enabled
    const currentEmbedders = settings.embedders;
    if (!currentEmbedders?.default) {
      console.log(`[meilisearch-vector] Configuring user-provided embedder`);
      try {
        // Use userProvided embedder since we generate embeddings ourselves
        const taskId = await index.updateEmbedders({
          default: {
            source: "userProvided",
            dimensions: 1536, // Default for text-embedding-3-small, will be updated on first insert
          },
        });
        await this.client!.waitForTask(taskId.taskUid);
      } catch (error) {
        console.warn(
          `[meilisearch-vector] Failed to configure embedder. Vector search may not work: ${error}`,
        );
      }
    }
  }
}
