import type { TaskResult } from "tinybench";
import { Bench } from "tinybench";

import type { SeedResult } from "./seed";
import { logInfo, logStep, logSuccess } from "./log";
import { formatMs, formatNumber } from "./utils";

// Type guard for completed task results
type CompletedTaskResult = Extract<TaskResult, { state: "completed" }>;

export interface BenchmarkRow {
  name: string;
  ops: number;
  mean: number;
  p75: number;
  p99: number;
  samples: number;
}

export interface BenchmarkOptions {
  timeMs?: number;
  warmupMs?: number;
}

export async function runBenchmarks(
  seed: SeedResult,
  options?: BenchmarkOptions,
): Promise<BenchmarkRow[]> {
  const bench = new Bench({
    time: options?.timeMs ?? 1000,
    warmupTime: options?.warmupMs ?? 300,
  });

  const sampleTag = seed.tags[0];
  const sampleList = seed.lists[0];
  const sampleIds = seed.bookmarks.slice(0, 50).map((b) => b.id);

  bench.add("bookmarks.getBookmarks (page)", async () => {
    await seed.trpc.bookmarks.getBookmarks.query({
      limit: 50,
    });
  });

  if (sampleTag) {
    bench.add("bookmarks.getBookmarks (tag filter)", async () => {
      await seed.trpc.bookmarks.getBookmarks.query({
        limit: 50,
        tagId: sampleTag.id,
      });
    });
  }

  if (sampleList) {
    bench.add("bookmarks.getBookmarks (list filter)", async () => {
      await seed.trpc.bookmarks.getBookmarks.query({
        limit: 50,
        listId: sampleList.id,
      });
    });
  }

  if (sampleList && sampleIds.length > 0) {
    bench.add("lists.getListsOfBookmark", async () => {
      await seed.trpc.lists.getListsOfBookmark.query({
        bookmarkId: sampleIds[0],
      });
    });
  }

  bench.add("bookmarks.searchBookmarks", async () => {
    await seed.trpc.bookmarks.searchBookmarks.query({
      text: seed.searchTerm,
      limit: 20,
    });
  });

  bench.add("bookmarks.getBookmarks (by ids)", async () => {
    await seed.trpc.bookmarks.getBookmarks.query({
      ids: sampleIds.slice(0, 20),
      includeContent: false,
    });
  });

  // Benchmark with cursor (without listId)
  {
    const firstPage = await seed.trpc.bookmarks.getBookmarks.query({
      limit: 50,
    });
    bench.add("bookmarks.getBookmarks (with cursor)", async () => {
      if (firstPage.nextCursor) {
        await seed.trpc.bookmarks.getBookmarks.query({
          limit: 50,
          cursor: firstPage.nextCursor,
        });
      }
    });
  }

  // Benchmark with cursor and listId
  if (sampleList) {
    const firstPage = await seed.trpc.bookmarks.getBookmarks.query({
      limit: 50,
      listId: sampleList.id,
    });
    bench.add("bookmarks.getBookmarks (cursor + list filter)", async () => {
      if (firstPage.nextCursor) {
        await seed.trpc.bookmarks.getBookmarks.query({
          limit: 50,
          listId: sampleList.id,
          cursor: firstPage.nextCursor,
        });
      }
    });
  }

  // Benchmark with archived filter
  bench.add("bookmarks.getBookmarks (archived filter)", async () => {
    await seed.trpc.bookmarks.getBookmarks.query({
      limit: 50,
      archived: true,
    });
  });

  // Benchmark with favourited filter
  bench.add("bookmarks.getBookmarks (favourited filter)", async () => {
    await seed.trpc.bookmarks.getBookmarks.query({
      limit: 50,
      favourited: true,
    });
  });

  // Benchmark with archived and list filter combined
  if (sampleList) {
    bench.add("bookmarks.getBookmarks (archived + list filter)", async () => {
      await seed.trpc.bookmarks.getBookmarks.query({
        limit: 50,
        archived: true,
        listId: sampleList.id,
      });
    });
  }

  // Benchmark with favourited and list filter combined
  if (sampleList) {
    bench.add("bookmarks.getBookmarks (favourited + list filter)", async () => {
      await seed.trpc.bookmarks.getBookmarks.query({
        limit: 50,
        favourited: true,
        listId: sampleList.id,
      });
    });
  }

  logStep("Running benchmarks");
  await bench.run();
  logSuccess("Benchmarks complete");

  const rows = bench.tasks
    .map((task) => {
      const result = task.result;

      // Check for errored state
      if ("error" in result) {
        console.error(`\n⚠️  Benchmark "${task.name}" failed with error:`);
        console.error(result.error);
        return null;
      }

      // Check if task completed successfully
      if (result.state !== "completed") {
        console.warn(
          `\n⚠️  Benchmark "${task.name}" did not complete. State: ${result.state}`,
        );
        return null;
      }

      return toRow(task.name, result);
    })
    .filter(Boolean) as BenchmarkRow[];

  renderTable(rows);
  logInfo(
    "ops/s uses tinybench's hz metric; durations are recorded in milliseconds.",
  );

  return rows;
}

function toRow(name: string, result: CompletedTaskResult): BenchmarkRow {
  // The statistics are now in result.latency and result.throughput
  const latency = result.latency;
  const throughput = result.throughput;

  return {
    name,
    ops: throughput.mean, // ops/s is the mean throughput
    mean: latency.mean,
    p75: latency.p75,
    p99: latency.p99,
    samples: latency.samplesCount,
  };
}

function renderTable(rows: BenchmarkRow[]): void {
  const headers = ["Benchmark", "ops/s", "avg", "p75", "p99", "samples"];

  const data = rows.map((row) => [
    row.name,
    formatNumber(row.ops, 1),
    formatMs(row.mean),
    formatMs(row.p75),
    formatMs(row.p99),
    String(row.samples),
  ]);

  const columnWidths = headers.map((header, index) =>
    Math.max(header.length, ...data.map((row) => row[index].length)),
  );

  const formatRow = (cells: string[]): string =>
    cells.map((cell, index) => cell.padEnd(columnWidths[index])).join("  ");

  console.log("");
  console.log(formatRow(headers));
  console.log(columnWidths.map((width) => "-".repeat(width)).join("  "));
  data.forEach((row) => console.log(formatRow(row)));
  console.log("");
}
