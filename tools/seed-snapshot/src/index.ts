import { execFileSync, execSync } from "child_process";
import fs from "fs/promises";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import type {
  ZBookmark,
  ZBookmarkedLink,
} from "@karakeep/shared/types/bookmarks";
import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import type { ZTagBasic } from "@karakeep/shared/types/tags";
import type { AppRouter } from "@karakeep/trpc/routers/_app";

type TrpcClient = ReturnType<typeof getTrpcClient>;
type CrawlStatus = NonNullable<ZBookmarkedLink["crawlStatus"]>;

const PASSWORD = "test1234";
const USER_DATASETS = {
  test1: {
    tagNames: ["research", "docs", "product"],
    urls: [
      "https://www.nasa.gov/",
      "https://www.nationalgeographic.com/",
      "https://www.theverge.com/",
      "https://www.wired.com/",
      "https://www.apple.com/ipad-pro/",
      "https://www.figma.com/",
      "https://linear.app/",
      "https://www.notion.com/",
      "https://stripe.com/",
      "https://www.shopify.com/",
      "https://developer.mozilla.org/en-US/docs/Web",
      "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
      "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API",
      "https://developer.mozilla.org/en-US/docs/Web/CSS",
      "https://web.dev/learn/html",
      "https://web.dev/learn/css",
      "https://web.dev/learn/javascript",
      "https://www.raspberrypi.com/products/raspberry-pi-5/",
      "https://www.postgresql.org/docs/current/index.html",
      "https://docs.docker.com/get-started/",
    ],
    lists: {
      root: "Reading Queue",
      child: "Reference",
      smartTag: "Research Smart",
      smartFav: "Favorites Smart",
    },
  },
  test2: {
    tagNames: ["engineering", "design", "ops"],
    urls: [
      "https://github.com/features/actions",
      "https://www.cloudflare.com/",
      "https://web.dev/",
      "https://www.raspberrypi.com/products/raspberry-pi-5/",
    ],
    lists: {
      root: "Workbench",
      child: "Deep Dives",
      smartTag: "Engineering Smart",
      smartFav: "Archived Smart",
    },
  },
} as const;

type UserDataset = (typeof USER_DATASETS)[keyof typeof USER_DATASETS];

const USERS = [
  {
    email: "test1@example.com",
    name: "Seed Test 1",
    datasetKey: "test1",
  },
  {
    email: "test2@example.com",
    name: "Seed Test 2",
    datasetKey: "test2",
  },
  { email: "test3@example.com", name: "Seed Test 3", datasetKey: null },
] as const;

interface SeededBookmark {
  id: string;
  url: string;
  title: string;
  crawlStatus: CrawlStatus | null;
}

interface SeededUserManifest {
  email: string;
  password: string;
  seeded: boolean;
  apiKeyName: string;
  counts: {
    bookmarks: number;
    tags: number;
    manualLists: number;
    smartLists: number;
  };
  bookmarks: SeededBookmark[];
  tags: string[];
  lists: Array<{
    name: string;
    type: "manual" | "smart";
    parentName: string | null;
    query: string | null;
  }>;
}

interface SnapshotManifest {
  createdAt: string;
  sourceCommit: string | null;
  archive: string;
  users: SeededUserManifest[];
}

function logStep(title: string): void {
  console.log(`\n== ${title}`);
}

function logInfo(message: string): void {
  console.log(`  -- ${message}`);
}

function logSuccess(message: string): void {
  console.log(`  OK ${message}`);
}

function logWarn(message: string): void {
  console.log(`  !! ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(
  fn: () => Promise<boolean>,
  description: string,
  timeoutMs = 60000,
  intervalMs = 1000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await fn()) return;
    } catch {
      // Retry until timeout. Services may still be warming up.
    }
    await sleep(intervalMs);
  }
  throw new Error(`${description} timed out after ${timeoutMs}ms`);
}

async function getRandomPort(): Promise<number> {
  const server = net.createServer();
  return new Promise<number>((resolve, reject) => {
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const address = server.address() as net.AddressInfo;
      server.close(() => resolve(address.port));
    });
  });
}

function getTrpcClient(
  apiKey?: string,
): ReturnType<typeof createTRPCClient<AppRouter>> {
  const port = process.env.KARAKEEP_PORT;
  if (!port) {
    throw new Error("KARAKEEP_PORT is not set. Did you start the containers?");
  }

  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        transformer: superjson,
        url: `http://localhost:${port}/api/trpc`,
        headers() {
          return {
            authorization: apiKey ? `Bearer ${apiKey}` : undefined,
          };
        },
      }),
    ],
  });
}

async function waitForHealthy(port: number): Promise<void> {
  await waitUntil(
    async () => {
      const res = await fetch(`http://localhost:${port}/api/health`);
      return res.status === 200;
    },
    "Karakeep stack to become healthy",
    Number(process.env.SEED_SNAPSHOT_HEALTH_TIMEOUT_MS ?? 120_000),
    1_000,
  );
}

async function captureDockerLogs(
  composeDir: string,
  composeEnv: NodeJS.ProcessEnv,
): Promise<void> {
  const logsDir = path.join(composeDir, "docker-logs");
  await fs.mkdir(logsDir, { recursive: true });

  for (const service of ["web", "meilisearch", "chrome"]) {
    try {
      execSync(
        `/bin/sh -c 'docker compose logs ${service} > "${logsDir}/${service}.log" 2>&1'`,
        {
          cwd: composeDir,
          env: composeEnv,
          stdio: "ignore",
        },
      );
      logInfo(`Captured logs for ${service}`);
    } catch (error) {
      logWarn(`Failed to capture logs for ${service}: ${error}`);
    }
  }
}

async function startContainers(composeDir: string, dataDir: string) {
  const port = await getRandomPort();
  const skipBuild =
    process.env.SEED_SNAPSHOT_NO_BUILD === "1" ||
    process.env.SEED_SNAPSHOT_SKIP_BUILD === "1";
  const buildArg = skipBuild ? "" : "--build";
  const composeEnv = {
    ...process.env,
    KARAKEEP_PORT: String(port),
    SEED_SNAPSHOT_DATA_DIR: dataDir,
  };

  logStep(`Starting docker compose on port ${port}`);
  execSync(`docker compose up ${buildArg} -d`, {
    cwd: composeDir,
    stdio: "inherit",
    env: composeEnv,
  });

  process.env.KARAKEEP_PORT = String(port);

  try {
    logInfo("Waiting for Karakeep to report healthy...");
    await waitForHealthy(port);
    await sleep(5_000);
    logSuccess("Containers are ready");
  } catch (error) {
    logWarn("Karakeep did not become healthy; stopping docker compose");
    await captureDockerLogs(composeDir, composeEnv);
    execSync("docker compose down", {
      cwd: composeDir,
      env: composeEnv,
      stdio: "inherit",
    });
    throw error;
  }

  let stopped = false;
  return {
    port,
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      logStep("Collecting docker logs");
      await captureDockerLogs(composeDir, composeEnv);
      logStep("Stopping docker compose");
      execSync("docker compose down", {
        cwd: composeDir,
        env: composeEnv,
        stdio: "inherit",
      });
    },
  };
}

async function createUser(
  authlessClient: TrpcClient,
  email: string,
  name: string,
): Promise<TrpcClient> {
  logInfo(`Creating ${email}`);
  await authlessClient.users.create.mutate({
    name,
    email,
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });

  const keyName = `seed-snapshot-${email}`;
  const { key } = await authlessClient.apiKeys.exchange.mutate({
    email,
    password: PASSWORD,
    keyName,
  });

  return getTrpcClient(key);
}

async function seedTags(
  client: TrpcClient,
  tagNames: readonly string[],
): Promise<ZTagBasic[]> {
  const tags: ZTagBasic[] = [];
  for (const name of tagNames) {
    tags.push(await client.tags.create.mutate({ name }));
  }
  return tags;
}

async function createLists(
  client: TrpcClient,
  dataset: UserDataset,
): Promise<{
  manualLists: ZBookmarkList[];
  smartLists: ZBookmarkList[];
}> {
  const root = await client.lists.create.mutate({
    name: dataset.lists.root,
    description: "Seed snapshot root manual list",
    icon: "book",
    type: "manual",
  });
  const child = await client.lists.create.mutate({
    name: dataset.lists.child,
    description: "Seed snapshot nested manual list",
    icon: "folder",
    type: "manual",
    parentId: root.id,
  });
  const smartTag = await client.lists.create.mutate({
    name: dataset.lists.smartTag,
    description: "Seed snapshot smart list by tag",
    icon: "tag",
    type: "smart",
    query: `tag:${dataset.tagNames[0]}`,
  });
  const smartFav = await client.lists.create.mutate({
    name: dataset.lists.smartFav,
    description: "Seed snapshot smart list by state",
    icon: "star",
    type: "smart",
    query: dataset.lists.smartFav.includes("Archived")
      ? "is:archived"
      : "is:fav",
    parentId: root.id,
  });

  return {
    manualLists: [root, child],
    smartLists: [smartTag, smartFav],
  };
}

async function createBookmarks(
  client: TrpcClient,
  dataset: UserDataset,
  tags: ZTagBasic[],
  lists: ZBookmarkList[],
): Promise<SeededBookmark[]> {
  const bookmarks: SeededBookmark[] = [];
  for (const [index, url] of dataset.urls.entries()) {
    const bookmark = await client.bookmarks.createBookmark.mutate({
      type: BookmarkTypes.LINK,
      url,
      title: `Seed snapshot bookmark ${index + 1}`,
      source: "api",
      summary: `Seeded bookmark for ${url}`,
      favourited: index % 2 === 0,
      archived: index === dataset.urls.length - 1,
      createdAt: new Date(Date.UTC(2025, 0, index + 1, 12, 0, 0)),
    });

    const attachedTags = [
      tags[index % tags.length],
      tags[(index + 1) % tags.length],
    ];
    await client.bookmarks.updateTags.mutate({
      bookmarkId: bookmark.id,
      attach: attachedTags.map((tag) => ({
        tagId: tag.id,
        tagName: tag.name,
      })),
      detach: [],
    });

    await client.lists.addToList.mutate({
      listId: lists[index % lists.length].id,
      bookmarkId: bookmark.id,
    });

    bookmarks.push({
      id: bookmark.id,
      url,
      title: bookmark.title ?? `Seed snapshot bookmark ${index + 1}`,
      crawlStatus: null,
    });
  }
  return bookmarks;
}

function getTerminalCrawlStatus(bookmark: ZBookmark): CrawlStatus | null {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    return null;
  }
  const status = bookmark.content.crawlStatus ?? null;
  return status === "success" || status === "failure" ? status : null;
}

async function waitForCrawls(
  client: TrpcClient,
  bookmarks: SeededBookmark[],
): Promise<void> {
  const pending = new Set(bookmarks.map((bookmark) => bookmark.id));
  await waitUntil(
    async () => {
      for (const bookmark of bookmarks) {
        if (!pending.has(bookmark.id)) continue;

        const latest = await client.bookmarks.getBookmark.query({
          bookmarkId: bookmark.id,
        });
        const terminalStatus = getTerminalCrawlStatus(latest);
        if (terminalStatus) {
          bookmark.crawlStatus = terminalStatus;
          pending.delete(bookmark.id);
          logInfo(`${bookmark.url} crawled with status ${terminalStatus}`);
        }
      }
      return pending.size === 0;
    },
    "Seed bookmark crawls to reach terminal status",
    Number(process.env.SEED_SNAPSHOT_CRAWL_TIMEOUT_MS ?? 180_000),
    3_000,
  );
}

async function seedUser(
  client: TrpcClient,
  user: (typeof USERS)[number],
  dataset: UserDataset,
): Promise<SeededUserManifest> {
  logStep(`Seeding ${user.email}`);
  const tags = await seedTags(client, dataset.tagNames);
  const { manualLists, smartLists } = await createLists(client, dataset);
  const bookmarks = await createBookmarks(client, dataset, tags, manualLists);
  await waitForCrawls(client, bookmarks);

  return {
    email: user.email,
    password: PASSWORD,
    seeded: true,
    apiKeyName: `seed-snapshot-${user.email}`,
    counts: {
      bookmarks: bookmarks.length,
      tags: tags.length,
      manualLists: manualLists.length,
      smartLists: smartLists.length,
    },
    bookmarks,
    tags: tags.map((tag) => tag.name),
    lists: [...manualLists, ...smartLists].map((list) => ({
      name: list.name,
      type: list.type,
      parentName:
        list.parentId === manualLists[0]?.id ? manualLists[0].name : null,
      query: list.query ?? null,
    })),
  };
}

async function createUsersAndSeedData(): Promise<SeededUserManifest[]> {
  const authlessClient = getTrpcClient();
  const manifests: SeededUserManifest[] = [];

  logStep("Creating seed users");
  for (const user of USERS) {
    const client = await createUser(authlessClient, user.email, user.name);
    if (user.datasetKey) {
      manifests.push(
        await seedUser(client, user, USER_DATASETS[user.datasetKey]),
      );
    } else {
      manifests.push({
        email: user.email,
        password: PASSWORD,
        seeded: false,
        apiKeyName: `seed-snapshot-${user.email}`,
        counts: {
          bookmarks: 0,
          tags: 0,
          manualLists: 0,
          smartLists: 0,
        },
        bookmarks: [],
        tags: [],
        lists: [],
      });
      logSuccess(`${user.email} left empty`);
    }
  }

  return manifests;
}

function formatSnapshotTimestamp(date: Date): string {
  const pad = (num: number) => String(num).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    "-",
    pad(date.getUTCMonth() + 1),
    "-",
    pad(date.getUTCDate()),
    "-",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

function getSourceCommit(repoRoot: string): string | null {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

async function writeSnapshot(params: {
  dataDir: string;
  repoRoot: string;
  users: SeededUserManifest[];
}): Promise<void> {
  const snapshotsDir = path.join(params.repoRoot, "snapshots");
  await fs.mkdir(snapshotsDir, { recursive: true });

  const createdAt = new Date();
  const timestamp = formatSnapshotTimestamp(createdAt);
  const archiveName = `seed-data-${timestamp}.tar.gz`;
  const manifestName = `seed-data-${timestamp}.json`;
  const archivePath = path.join(snapshotsDir, archiveName);
  const manifestPath = path.join(snapshotsDir, manifestName);

  logStep("Archiving data directory");
  execFileSync(
    "tar",
    ["--exclude", "._*", "-czf", archivePath, "-C", params.dataDir, "."],
    {
      cwd: params.repoRoot,
      env: {
        ...process.env,
        COPYFILE_DISABLE: "1",
      },
      stdio: "inherit",
    },
  );

  const manifest: SnapshotManifest = {
    createdAt: createdAt.toISOString(),
    sourceCommit: getSourceCommit(params.repoRoot),
    archive: archiveName,
    users: params.users,
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  logSuccess(`Wrote ${archivePath}`);
  logSuccess(`Wrote ${manifestPath}`);
}

async function main(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.join(__dirname, "..");
  const repoRoot = path.join(packageRoot, "..", "..");
  const composeDir = packageRoot;
  const dataDir = path.join(packageRoot, ".tmp", "data");

  await fs.rm(dataDir, { force: true, recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.chmod(dataDir, 0o777);

  const running = await startContainers(composeDir, dataDir);

  const stopContainers = async () => {
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
    const users = await createUsersAndSeedData();
    await stopContainers();
    await writeSnapshot({ dataDir, repoRoot, users });
    logSuccess("Seed snapshot complete");
  } catch (error) {
    logWarn("Seed snapshot failed");
    console.error(error);
    await stopContainers();
    process.exitCode = 1;
  }
}

main();
