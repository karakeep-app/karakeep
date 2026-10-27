import type { Index } from "meilisearch";
import { Meilisearch } from "meilisearch";

import type {
  BookmarkVectorDocument,
  VectorFilterQuery,
  VectorSearchOptions,
  VectorSearchResponse,
  VectorStoreClient,
  VectorSimilarSearchOptions,
} from "@karakeep/shared/vectorStore";
import serverConfig from "@karakeep/shared/config";
import { PluginProvider } from "@karakeep/shared/plugins";

import { envConfig } from "./env";
import { BatchingDocumentQueue } from "../../lib/batchingDocumentQueue";

// Meilisearch document type that includes the vector fields. Karakeep computes
// vectors itself, so both embedders are userProvided: `default` holds the rich
// search profile used by semantic search and tag suggestions, `similar` holds
// the lean similar-articles vector.
interface MeiliVectorDocument {
  id: string;
  userId: string;
  _vectors: {
    default: unknown;
    similar?: unknown;
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

/**
 * Configures the vector index (filterable attributes + embedders) and returns
 * whether the lean `similar` embedder ended up configured. Similar-document
 * lookups use it when available and fall back to the search-profile embedder
 * otherwise (upgrade path: existing documents predate the split).
 */
async function configureVectorIndex(
  meiliClient: Meilisearch,
  index: Index<MeiliVectorDocument>,
): Promise<boolean> {
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
    await meiliClient.tasks.waitForTask(taskId.taskUid);
  }

  // Configure embedders for vector search. Both embedders are userProvided
  // since we generate embeddings ourselves: `default` for the rich search
  // profile, `similar` for the lean similar-articles text.
  const currentEmbedders = settings.embedders;
  const desiredDimensions = serverConfig.embedding.dimensions;
  const desiredEmbedders = {
    default: {
      source: "userProvided" as const,
      dimensions: desiredDimensions,
    },
    similar: {
      source: "userProvided" as const,
      dimensions: desiredDimensions,
    },
  };
  const updates = Object.fromEntries(
    Object.entries(desiredEmbedders).filter(([name, desired]) => {
      const current = currentEmbedders?.[name];
      return (
        !current ||
        current.source != "userProvided" ||
        current.dimensions !== desired.dimensions
      );
    }),
  );
  if (Object.keys(updates).length > 0) {
    console.log(
      `[meilisearch-vector] Configuring user-provided embedders: ${Object.keys(updates).join(", ")}`,
    );
    try {
      // waitForTask resolves even for failed tasks; check the outcome
      // explicitly. Adding a userProvided embedder fails when existing
      // documents don't provide vectors for it yet.
      const taskId = await index.updateEmbedders(updates);
      const task = await meiliClient.tasks.waitForTask(taskId.taskUid);
      if (task.error) {
        console.warn(
          `[meilisearch-vector] Failed to configure embedders (${Object.keys(updates).join(", ")}): ${task.error.message}. ` +
            `Similar articles keep working against the search-profile vectors; ` +
            `to switch them to the lean format, run \`karakeep admin jobs regenerate-embeddings --status all\` ` +
            `(it empties the index first, after which the embedder is added and the embeddings are regenerated).`,
        );
      }
    } catch (error) {
      console.warn(
        `[meilisearch-vector] Failed to enqueue the embedder update (${Object.keys(updates).join(", ")}). Vector search may not work: ${error}`,
      );
    }
  }

  // Re-check the settings after any update; the task outcomes above don't
  // tell us reliably whether the embedder ended up configured.
  const embedders = (await index.getSettings()).embedders;
  return embedders?.similar?.source === "userProvided";
}

class MeiliSearchVectorClient implements VectorStoreClient {
  private batchQueue: BatchingDocumentQueue<MeiliVectorDocument>;

  constructor(
    private index: Index<MeiliVectorDocument>,
    private client: Meilisearch,
    jobTimeoutSec: number,
    batchSize: number,
    batchTimeoutMs: number,
    // The embedder used for similar-document lookups. "similar" when the
    // index has the lean similar-articles embedder configured; "default"
    // (the rich search profile) as a fallback for indexes whose documents
    // predate the split, so similar articles keep working there.
    private similarEmbedder: string,
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
        default: doc.vectors.search,
        ...(doc.vectors.similar ? { similar: doc.vectors.similar } : {}),
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
      rankingScoreThreshold: options.rankingScoreThreshold,
    });

    return {
      hits: result.hits.map((hit) => ({
        id: hit.id,
        score: hit._rankingScore ?? 0,
      })),
      processingTimeMs: result.processingTimeMs,
    };
  }

  async findSimilar(
    options: VectorSimilarSearchOptions,
  ): Promise<VectorSearchResponse> {
    const results = await this.index.searchSimilarDocuments({
      id: options.id,
      filter: options.filter?.map((f) => filterToMeiliSearchFilter(f)),
      limit: options.limit ?? 10,
      offset: options.offset,
      attributesToRetrieve: ["id"],
      showRankingScore: true,
      embedder: this.similarEmbedder,
      rankingScoreThreshold: options.rankingScoreThreshold,
    });

    return {
      hits: results.hits.map((hit) => ({
        id: hit.id,
        score: hit._rankingScore ?? 0,
      })),
      processingTimeMs: results.processingTimeMs,
    };
  }

  async clearIndex(): Promise<void> {
    const task = await this.index.deleteAllDocuments();
    await this.ensureTaskSuccess(task.taskUid);
    // The index is empty now, so a `similar` embedder that couldn't be
    // configured before (documents without lean vectors) can be added here.
    // This makes the "regenerate embeddings" remediation self-contained.
    await configureVectorIndex(this.client, this.index);
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

  async getHealth(): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    const health = await this.client.health();
    return health.status === "available";
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
    try {
      return await this.initPromise;
    } finally {
      // Always clear the in-flight promise, including when init rejected.
      // Otherwise a transient failure (e.g. meilisearch restarting) would be
      // cached as a permanently rejected promise and every later call would
      // replay it for the lifetime of the process.
      this.initPromise = undefined;
    }
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

    const similarEmbedderAvailable = await configureVectorIndex(
      this.client,
      indexFound,
    );
    this.vectorClient = new MeiliSearchVectorClient(
      indexFound,
      this.client,
      serverConfig.embedding.jobTimeoutSec,
      envConfig.MEILI_BATCH_SIZE,
      envConfig.MEILI_BATCH_TIMEOUT_MS,
      // Use the lean similar-articles embedder when it's configured; fall
      // back to the search-profile embedder for indexes whose documents
      // predate the split (upgrade path).
      similarEmbedderAvailable ? "similar" : "default",
    );
    return this.vectorClient;
  }
}
