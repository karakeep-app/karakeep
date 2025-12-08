import * as os from "os";
import * as path from "path";
import { Worker } from "worker_threads";

import logger from "@karakeep/shared/logger";

interface ParseRequest {
  type: "parse";
  htmlContent: string;
  url: string;
  jobId: string;
}

interface ParseResponse {
  meta: {
    title?: string;
    description?: string;
    image?: string;
    logo?: string;
    author?: string;
    publisher?: string;
    datePublished?: string;
    dateModified?: string;
  };
  readableContent: {
    content: string;
  } | null;
}

interface WorkerMessage {
  success: boolean;
  data?: ParseResponse;
  error?: { message: string; stack?: string };
}

class ParserWorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private workerPath: string;
  private poolSize: number;

  constructor(poolSize?: number) {
    // In production (dist), use .js files. In development, use .ts files with tsx
    const isProduction = __dirname.includes("/dist/");
    if (isProduction) {
      this.workerPath = path.join(__dirname, "parserWorker.js");
    } else {
      // In development, use tsx to run the TypeScript file
      this.workerPath = path.join(__dirname, "parserWorker.ts");
    }
    this.poolSize = poolSize ?? Math.max(1, os.cpus().length - 1);
  }

  async initialize(): Promise<void> {
    logger.info(
      `[ParserWorkerPool] Initializing worker pool with ${this.poolSize} workers`,
    );
    const isProduction = __dirname.includes("/dist/");
    for (let i = 0; i < this.poolSize; i++) {
      const workerOptions = isProduction
        ? {}
        : {
            execArgv: ["--import", "tsx"],
          };
      const worker = new Worker(this.workerPath, workerOptions);
      worker.on("error", (error) => {
        logger.error(`[ParserWorkerPool] Worker error: ${error.message}`);
      });
      worker.on("exit", (code) => {
        if (code !== 0) {
          logger.error(
            `[ParserWorkerPool] Worker stopped with exit code ${code}`,
          );
        }
      });
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
    logger.info(
      `[ParserWorkerPool] Successfully initialized ${this.poolSize} workers`,
    );
  }

  private async getAvailableWorker(): Promise<Worker> {
    while (this.availableWorkers.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return this.availableWorkers.pop()!;
  }

  private releaseWorker(worker: Worker): void {
    this.availableWorkers.push(worker);
  }

  async parse(
    htmlContent: string,
    url: string,
    jobId: string,
  ): Promise<ParseResponse> {
    const worker = await this.getAvailableWorker();

    try {
      return await new Promise<ParseResponse>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Parser worker timeout after 30 seconds"));
        }, 30000);

        const messageHandler = (message: WorkerMessage) => {
          clearTimeout(timeout);
          worker.off("message", messageHandler);
          worker.off("error", errorHandler);

          if (message.success && message.data) {
            resolve(message.data);
          } else {
            reject(
              new Error(
                message.error?.message ?? "Unknown parser worker error",
              ),
            );
          }
        };

        const errorHandler = (error: Error) => {
          clearTimeout(timeout);
          worker.off("message", messageHandler);
          worker.off("error", errorHandler);
          reject(error);
        };

        worker.on("message", messageHandler);
        worker.on("error", errorHandler);

        const request: ParseRequest = {
          type: "parse",
          htmlContent,
          url,
          jobId,
        };

        worker.postMessage(request);
      });
    } finally {
      this.releaseWorker(worker);
    }
  }

  async terminate(): Promise<void> {
    logger.info(`[ParserWorkerPool] Terminating worker pool`);
    await Promise.all(this.workers.map((worker) => worker.terminate()));
    this.workers = [];
    this.availableWorkers = [];
  }
}

let globalParserPool: ParserWorkerPool | null = null;

export async function getParserWorkerPool(): Promise<ParserWorkerPool> {
  if (!globalParserPool) {
    globalParserPool = new ParserWorkerPool();
    await globalParserPool.initialize();
  }
  return globalParserPool;
}

export async function terminateParserWorkerPool(): Promise<void> {
  if (globalParserPool) {
    await globalParserPool.terminate();
    globalParserPool = null;
  }
}
