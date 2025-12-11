import { runBenchmarks } from "./benchmarks";
import { logInfo, logStep, logSuccess, logWarn } from "./log";
import { seedData } from "./seed";
import { startContainers } from "./startContainers";

interface CliConfig {
  bookmarkCount: number;
  tagCount: number;
  listCount: number;
  concurrency: number;
  userCount: number;
  keepContainers: boolean;
  timeMs: number;
  warmupMs: number;
}

function numberFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadConfig(): CliConfig {
  return {
    bookmarkCount: numberFromEnv("BENCH_BOOKMARKS", 400),
    tagCount: numberFromEnv("BENCH_TAGS", 25),
    listCount: numberFromEnv("BENCH_LISTS", 6),
    concurrency: numberFromEnv("BENCH_SEED_CONCURRENCY", 12),
    userCount: numberFromEnv("BENCH_USERS", 3),
    keepContainers: process.env.BENCH_KEEP_CONTAINERS === "1",
    timeMs: numberFromEnv("BENCH_TIME_MS", 1000),
    warmupMs: numberFromEnv("BENCH_WARMUP_MS", 300),
  };
}

async function main() {
  const config = loadConfig();

  logStep("Benchmark configuration");
  logInfo(`Users:        ${config.userCount}`);
  logInfo(`Bookmarks:    ${config.bookmarkCount} per user`);
  logInfo(`Tags:         ${config.tagCount} per user`);
  logInfo(`Lists:        ${config.listCount} per user`);
  logInfo(`Seed concur.: ${config.concurrency}`);
  logInfo(`Time per case:${config.timeMs}ms (warmup ${config.warmupMs}ms)`);
  logInfo(`Keep containers after run: ${config.keepContainers ? "yes" : "no"}`);

  const running = await startContainers();

  const stopContainers = async () => {
    if (config.keepContainers) {
      logWarn(
        `Skipping docker compose shutdown (BENCH_KEEP_CONTAINERS=1). Port ${running.port} stays up.`,
      );
      return;
    }
    await running.stop();
  };

  const handleSignal = async (signal: NodeJS.Signals) => {
    logWarn(`Received ${signal}, shutting down...`);
    await stopContainers();
    process.exit(1);
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  try {
    const seedResult = await seedData({
      bookmarkCount: config.bookmarkCount,
      tagCount: config.tagCount,
      listCount: config.listCount,
      concurrency: config.concurrency,
      userCount: config.userCount,
    });

    await runBenchmarks(seedResult, {
      timeMs: config.timeMs,
      warmupMs: config.warmupMs,
    });
    logSuccess("All done");
  } catch (error) {
    logWarn("Benchmark run failed");
    console.error(error);
  } finally {
    await stopContainers();
  }
}

main();
