import type { Index } from "meilisearch";
import { Mutex } from "async-mutex";

import logger from "@karakeep/shared/logger";

interface MeiliDocument {
  id: string;
}

type PendingOperation<TDocument extends MeiliDocument> =
  | {
      type: "add";
      document: TDocument;
      resolve: () => void;
      reject: (error: Error) => void;
    }
  | {
      type: "delete";
      id: string;
      resolve: () => void;
      reject: (error: Error) => void;
    };

export class BatchingDocumentQueue<TDocument extends MeiliDocument> {
  private pendingOperations: PendingOperation<TDocument>[] = [];
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;
  private mutex = new Mutex();

  constructor(
    private index: Index<TDocument>,
    private jobTimeoutSec: number,
    private batchSize: number,
    private batchTimeoutMs: number,
    private logPrefix: string,
  ) {}

  async addDocument(document: TDocument): Promise<void> {
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

      if (this.pendingOperations.length === 0) return;

      const lastOpIndexByDocId = new Map<string, number>();
      for (let i = 0; i < this.pendingOperations.length; i++) {
        const op = this.pendingOperations[i]!;
        const docId = op.type === "add" ? op.document.id : op.id;
        lastOpIndexByDocId.set(docId, i);
      }

      const adds: Extract<PendingOperation<TDocument>, { type: "add" }>[] = [];
      const deletes: Extract<
        PendingOperation<TDocument>,
        { type: "delete" }
      >[] = [];
      const supersededByDocId = new Map<
        string,
        PendingOperation<TDocument>[]
      >();

      for (let i = 0; i < this.pendingOperations.length; i++) {
        const op = this.pendingOperations[i]!;
        const docId = op.type === "add" ? op.document.id : op.id;

        if (lastOpIndexByDocId.get(docId) !== i) {
          let list = supersededByDocId.get(docId);
          if (!list) {
            list = [];
            supersededByDocId.set(docId, list);
          }
          list.push(op);
          continue;
        }

        const superseded = supersededByDocId.get(docId) ?? [];
        const origResolve = op.resolve;
        const origReject = op.reject;
        op.resolve = () => {
          origResolve();
          superseded.forEach((s) => s.resolve());
        };
        op.reject = (error: Error) => {
          origReject(error);
          superseded.forEach((s) => s.reject(error));
        };

        if (op.type === "add") {
          adds.push(
            op as Extract<PendingOperation<TDocument>, { type: "add" }>,
          );
        } else {
          deletes.push(
            op as Extract<PendingOperation<TDocument>, { type: "delete" }>,
          );
        }
      }

      this.pendingOperations = [];

      for (let i = 0; i < deletes.length; i += this.batchSize) {
        const batch = deletes.slice(i, i + this.batchSize);
        logger.debug(
          `[${this.logPrefix}] Flushing delete batch: size=${batch.length}`,
        );
        await this.flushDeleteBatch(batch);
      }

      for (let i = 0; i < adds.length; i += this.batchSize) {
        const batch = adds.slice(i, i + this.batchSize);
        logger.debug(
          `[${this.logPrefix}] Flushing add batch: size=${batch.length}`,
        );
        await this.flushAddBatch(batch);
      }
    });
  }

  private async flushAddBatch(
    batch: Extract<PendingOperation<TDocument>, { type: "add" }>[],
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
    batch: Extract<PendingOperation<TDocument>, { type: "delete" }>[],
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
    const task = await this.index.tasks.waitForTask(taskUid, {
      interval: 200,
      timeout: this.jobTimeoutSec * 1000 * 0.9,
    });
    if (task.error) {
      throw new Error(`${this.logPrefix} task failed: ${task.error.message}`);
    }
  }
}
