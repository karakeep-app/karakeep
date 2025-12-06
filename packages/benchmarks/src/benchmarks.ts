import type { TaskResult } from "tinybench";
import { Bench } from "tinybench";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { SeedResult } from "./seed";
import { logInfo, logStep, logSuccess } from "./log";
import { formatMs, formatNumber, percentile } from "./utils";

export interface BenchmarkRow {
  name: string;
  ops: number;
  mean: number;
  p95: number;
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

  bench.add("bookmarks.createBookmark", async () => {
    const suffix = Math.random().toString(36).slice(2);
    const bookmark = await seed.trpc.bookmarks.createBookmark.mutate({
      type: BookmarkTypes.LINK,
      url: `https://bench.example.com/${suffix}`,
      title: `Live benchmark ${suffix}`,
      source: "api",
      summary: "On-demand bookmark creation during benchmark run.",
    });

    if (sampleTag) {
      await seed.trpc.bookmarks.updateTags.mutate({
        bookmarkId: bookmark.id,
        attach: [{ tagId: sampleTag.id, tagName: sampleTag.name }],
        detach: [],
      });
    }
  });

  logStep("Running benchmarks");
  await bench.warmup();
  await bench.run();
  logSuccess("Benchmarks complete");

  const rows = bench.tasks
    .map((task) => {
      if (!task.result) return null;
      return toRow(task.name, task.result);
    })
    .filter(Boolean) as BenchmarkRow[];

  renderTable(rows);
  logInfo(
    "ops/s uses tinybench's hz metric; durations are recorded in milliseconds.",
  );

  return rows;
}

function toRow(name: string, result: TaskResult): BenchmarkRow {
  return {
    name,
    ops: result.hz,
    mean: result.mean,
    p95: percentile(result.samples, 95),
    p99: result.p99 ?? percentile(result.samples, 99),
    samples: result.samples.length,
  };
}

function renderTable(rows: BenchmarkRow[]): void {
  const headers = ["Benchmark", "ops/s", "avg", "p95", "p99", "samples"];

  const data = rows.map((row) => [
    row.name,
    formatNumber(row.ops, 1),
    formatMs(row.mean),
    formatMs(row.p95),
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
