import { execFileSync, execSync } from "child_process";
import { existsSync } from "fs";
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
import { normalizeTextLength } from "@karakeep/shared/utils/reading-progress-dom";
import type { AppRouter } from "@karakeep/trpc/routers/_app";

// The generator can seed either a local build of HEAD or a released image
// (`--release 0.32.0`). Releases are seeded through the same tRPC client, so
// everything below must only use procedures and inputs that exist in every
// release we snapshot (currently v0.32.0 and later).

type TrpcClient = ReturnType<typeof getTrpcClient>;
type CrawlStatus = NonNullable<ZBookmarkedLink["crawlStatus"]>;

const PASSWORD = "test1234";
const RELEASE_IMAGE_REPO = "ghcr.io/karakeep-app/karakeep";
const LOCAL_IMAGE = "karakeep-seed-snapshot:local";

const USER_DATASETS = {
  test1: {
    tagNames: ["research", "docs", "product", "unused"],
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
    texts: [
      {
        title: "Seed snapshot note 1",
        text: "Karakeep keeps everything in one place. The quick brown fox jumps over the lazy dog, and the highlights in this note should survive every upgrade.",
        note: "A text bookmark with highlights",
        highlights: [
          { text: "quick brown fox", color: "yellow", note: null },
          {
            text: "survive every upgrade",
            color: "green",
            note: "The whole point of this snapshot",
          },
          { text: "Karakeep", color: "blue", note: null },
        ],
      },
      {
        title: "Seed snapshot note 2",
        text: "# Markdown note\n\n- first item\n- second item\n\nSome **bold** text and a [link](https://karakeep.app).",
        note: null,
        highlights: [],
      },
    ],
    assets: [
      {
        kind: "image",
        fileName: "seed-pixel.png",
        title: "Seed snapshot image",
      },
      {
        kind: "pdf",
        fileName: "seed-document.pdf",
        title: "Seed snapshot PDF",
      },
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
    texts: [
      {
        title: "Seed snapshot note 3",
        text: "Notes from the engineering sync: ship the migration tests before the next release.",
        note: "Owned by test2",
        highlights: [],
      },
    ],
    assets: [],
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

// A 1x1 PNG, small enough to inline.
const PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

interface SeededBookmark {
  id: string;
  type: "link" | "text" | "asset";
  url: string | null;
  title: string;
  crawlStatus: CrawlStatus | null;
  note: string | null;
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
    highlights: number;
    rules: number;
    prompts: number;
    feeds: number;
    webhooks: number;
    importSessions: number;
  };
  bookmarks: SeededBookmark[];
  tags: string[];
  lists: Array<{
    name: string;
    type: "manual" | "smart";
    parentName: string | null;
    query: string | null;
  }>;
  highlights: Array<{ bookmarkTitle: string; text: string; color: string }>;
  readingProgress: Array<{ bookmarkTitle: string; percent: number }>;
}

interface SharingManifest {
  ownerEmail: string;
  listName: string;
  collaborators: Array<{
    email: string;
    role: "viewer" | "editor";
    status: "accepted" | "pending";
  }>;
  bookmarksAddedByCollaborators: Array<{ email: string; title: string }>;
}

interface SnapshotManifest {
  createdAt: string;
  // The Karakeep version whose image generated the data, or "dev" for a
  // local build of the working tree.
  karakeepVersion: string;
  image: string;
  // The commit the data was generated from: the release tag's commit, or HEAD
  // for local builds.
  sourceCommit: string | null;
  generatorCommit: string | null;
  archive: string;
  users: SeededUserManifest[];
  sharing: SharingManifest[];
}

interface Options {
  release: string | null;
  replace: boolean;
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

function parseOptions(argv: string[]): Options {
  let release = process.env.SEED_SNAPSHOT_RELEASE ?? null;
  let replace = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--release" || arg.startsWith("--release=")) {
      release =
        arg === "--release"
          ? (argv[++i] ?? "")
          : arg.slice("--release=".length);
      // Without this, a missing version would silently fall back to a local
      // build.
      if (release === "" || release.startsWith("--")) {
        throw new Error("--release expects a version like 0.32.0");
      }
    } else if (arg === "--replace") {
      replace = true;
    } else if (arg === "--") {
      continue;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (release !== null) {
    release = release.replace(/^v/, "");
    if (!/^\d+\.\d+\.\d+$/.test(release)) {
      throw new Error(
        `--release expects a version like 0.32.0, got "${release}"`,
      );
    }
  }
  return { release, replace };
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

function getBaseUrl(): string {
  const port = process.env.KARAKEEP_PORT;
  if (!port) {
    throw new Error("KARAKEEP_PORT is not set. Did you start the containers?");
  }
  return `http://localhost:${port}`;
}

function getTrpcClient(
  apiKey?: string,
): ReturnType<typeof createTRPCClient<AppRouter>> {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        transformer: superjson,
        url: `${getBaseUrl()}/api/trpc`,
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

async function startContainers(
  composeDir: string,
  dataDir: string,
  image: string,
  options: Options,
) {
  const port = await getRandomPort();
  const skipBuild =
    process.env.SEED_SNAPSHOT_NO_BUILD === "1" ||
    process.env.SEED_SNAPSHOT_SKIP_BUILD === "1";
  const composeEnv = {
    ...process.env,
    KARAKEEP_PORT: String(port),
    SEED_SNAPSHOT_DATA_DIR: dataDir,
    SEED_SNAPSHOT_IMAGE: image,
  };

  let upArgs: string;
  if (options.release) {
    // Released images are pulled explicitly so compose never falls back to
    // building the working tree under the release's tag.
    logStep(`Pulling ${image}`);
    execFileSync("docker", ["pull", image], { stdio: "inherit" });
    upArgs = "--no-build";
  } else {
    upArgs = skipBuild ? "" : "--build";
  }

  logStep(`Starting docker compose on port ${port}`);
  execSync(`docker compose up ${upArgs} -d`, {
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

// Releases before better-auth (< 0.34) signed users up through the
// `users.create` tRPC procedure. It no longer exists in AppRouter, so it's
// called over plain HTTP. Returns false if the server doesn't have it.
async function signUpUserLegacy(input: {
  name: string;
  email: string;
  password: string;
}): Promise<boolean> {
  const response = await fetch(`${getBaseUrl()}/api/trpc/users.create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      json: { ...input, confirmPassword: input.password },
    }),
  });
  if (response.status === 404) {
    return false;
  }
  if (!response.ok) {
    throw new Error(
      `Failed to sign up ${input.email}: ${response.status} ${await response.text()}`,
    );
  }
  return true;
}

// Signs up through better-auth's endpoint, the same way the web app does.
async function signUpUserBetterAuth(input: {
  name: string;
  email: string;
  password: string;
}) {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Node's fetch sends Sec-Fetch-* headers but no Origin, which
      // better-auth's CSRF protection rejects. Browsers always send it.
      Origin: baseUrl,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to sign up ${input.email}: ${response.status} ${await response.text()}`,
    );
  }
}

async function createUser(
  authlessClient: TrpcClient,
  email: string,
  name: string,
): Promise<{ client: TrpcClient; apiKey: string }> {
  logInfo(`Creating ${email}`);
  const input = { name, email, password: PASSWORD };
  if (await signUpUserLegacy(input)) {
    logInfo("Signed up through the legacy users.create procedure");
  } else {
    await signUpUserBetterAuth(input);
  }

  const keyName = `seed-snapshot-${email}`;
  const { key } = await authlessClient.apiKeys.exchange.mutate({
    email,
    password: PASSWORD,
    keyName,
  });

  return { client: getTrpcClient(key), apiKey: key };
}

async function uploadAsset(
  apiKey: string,
  file: { bytes: Uint8Array; fileName: string; contentType: string },
): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new File([new Uint8Array(file.bytes)], file.fileName, {
      type: file.contentType,
    }),
  );
  const response = await fetch(`${getBaseUrl()}/api/assets`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    throw new Error(
      `Failed to upload ${file.fileName}: ${response.status} ${await response.text()}`,
    );
  }
  const { assetId } = (await response.json()) as { assetId: string };
  return assetId;
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
    icon: "📚",
    type: "manual",
  });
  const child = await client.lists.create.mutate({
    name: dataset.lists.child,
    description: "Seed snapshot nested manual list",
    icon: "📁",
    type: "manual",
    parentId: root.id,
  });
  const smartTag = await client.lists.create.mutate({
    name: dataset.lists.smartTag,
    description: "Seed snapshot smart list by tag",
    icon: "🏷️",
    type: "smart",
    query: `tag:${dataset.tagNames[0]}`,
  });
  const smartFav = await client.lists.create.mutate({
    name: dataset.lists.smartFav,
    description: "Seed snapshot smart list by state",
    icon: "😍",
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

async function createLinkBookmarks(
  client: TrpcClient,
  dataset: UserDataset,
  tags: ZTagBasic[],
  lists: ZBookmarkList[],
): Promise<SeededBookmark[]> {
  // The "unused" tag is left unattached on purpose.
  const attachableTags = tags.filter((tag) => tag.name !== "unused");
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
      attachableTags[index % attachableTags.length],
      attachableTags[(index + 1) % attachableTags.length],
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

    let note: string | null = null;
    if (index % 3 === 0) {
      note = `Seed note for bookmark ${index + 1}`;
      await client.bookmarks.updateBookmark.mutate({
        bookmarkId: bookmark.id,
        note,
      });
    }

    bookmarks.push({
      id: bookmark.id,
      type: "link",
      url,
      title: bookmark.title ?? `Seed snapshot bookmark ${index + 1}`,
      crawlStatus: null,
      note,
    });
  }
  return bookmarks;
}

async function createTextBookmarks(
  client: TrpcClient,
  dataset: UserDataset,
  tags: ZTagBasic[],
): Promise<SeededBookmark[]> {
  const bookmarks: SeededBookmark[] = [];
  for (const [index, entry] of dataset.texts.entries()) {
    const bookmark = await client.bookmarks.createBookmark.mutate({
      type: BookmarkTypes.TEXT,
      text: entry.text,
      title: entry.title,
      source: "web",
      ...(entry.note ? { note: entry.note } : {}),
      createdAt: new Date(Date.UTC(2025, 1, index + 1, 12, 0, 0)),
    });
    await client.bookmarks.updateTags.mutate({
      bookmarkId: bookmark.id,
      attach: [{ tagId: tags[0].id, tagName: tags[0].name }],
      detach: [],
    });
    bookmarks.push({
      id: bookmark.id,
      type: "text",
      url: null,
      title: entry.title,
      crawlStatus: null,
      note: entry.note,
    });
  }
  return bookmarks;
}

async function createAssetBookmarks(
  client: TrpcClient,
  apiKey: string,
  dataset: UserDataset,
  repoRoot: string,
): Promise<SeededBookmark[]> {
  const bookmarks: SeededBookmark[] = [];
  for (const [index, entry] of dataset.assets.entries()) {
    const bytes =
      entry.kind === "image"
        ? Buffer.from(PIXEL_PNG_BASE64, "base64")
        : await fs.readFile(
            path.join(repoRoot, "packages/e2e_tests/fixtures/test.pdf"),
          );
    const assetId = await uploadAsset(apiKey, {
      bytes,
      fileName: entry.fileName,
      contentType: entry.kind === "image" ? "image/png" : "application/pdf",
    });
    const bookmark = await client.bookmarks.createBookmark.mutate({
      type: BookmarkTypes.ASSET,
      assetType: entry.kind,
      assetId,
      fileName: entry.fileName,
      title: entry.title,
      source: "web",
      createdAt: new Date(Date.UTC(2025, 2, index + 1, 12, 0, 0)),
    });
    bookmarks.push({
      id: bookmark.id,
      type: "asset",
      url: null,
      title: entry.title,
      crawlStatus: null,
      note: null,
    });
  }
  return bookmarks;
}

async function createHighlights(
  client: TrpcClient,
  dataset: UserDataset,
  textBookmarks: SeededBookmark[],
): Promise<SeededUserManifest["highlights"]> {
  const highlights: SeededUserManifest["highlights"] = [];
  for (const [index, entry] of dataset.texts.entries()) {
    const bookmark = textBookmarks[index];
    for (const spec of entry.highlights) {
      const startOffset = entry.text.indexOf(spec.text);
      if (startOffset < 0) {
        throw new Error(
          `Highlight text "${spec.text}" not found in "${entry.title}"`,
        );
      }
      await client.highlights.create.mutate({
        bookmarkId: bookmark.id,
        startOffset,
        endOffset: startOffset + spec.text.length,
        color: spec.color,
        text: spec.text,
        note: spec.note,
      });
      highlights.push({
        bookmarkTitle: bookmark.title,
        text: spec.text,
        color: spec.color,
      });
    }
  }
  return highlights;
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
  const pending = new Set(
    bookmarks.filter((b) => b.type === "link").map((bookmark) => bookmark.id),
  );
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

async function recordReadingProgress(
  client: TrpcClient,
  bookmarks: SeededBookmark[],
): Promise<SeededUserManifest["readingProgress"]> {
  const crawled = bookmarks
    .filter((b) => b.type === "link" && b.crawlStatus === "success")
    .slice(0, 2);
  const progress: SeededUserManifest["readingProgress"] = [];
  for (const [index, bookmark] of crawled.entries()) {
    const percent = index === 0 ? 35 : 80;
    // The reader stores the offset in normalized text characters, so derive
    // it from the crawled content for the offset and percent to agree.
    const latest = await client.bookmarks.getBookmark.query({
      bookmarkId: bookmark.id,
      includeContent: true,
    });
    const html =
      latest.content.type === BookmarkTypes.LINK
        ? (latest.content.htmlContent ?? "")
        : "";
    const textLength = normalizeTextLength(html.replace(/<[^>]*>/g, " "));
    await client.bookmarks.updateReadingProgress.mutate({
      bookmarkId: bookmark.id,
      readingProgressOffset: Math.floor((textLength * percent) / 100),
      readingProgressPercent: percent,
    });
    progress.push({ bookmarkTitle: bookmark.title, percent });
  }
  return progress;
}

function emptyManifest(email: string): SeededUserManifest {
  return {
    email,
    password: PASSWORD,
    seeded: false,
    apiKeyName: `seed-snapshot-${email}`,
    counts: {
      bookmarks: 0,
      tags: 0,
      manualLists: 0,
      smartLists: 0,
      highlights: 0,
      rules: 0,
      prompts: 0,
      feeds: 0,
      webhooks: 0,
      importSessions: 0,
    },
    bookmarks: [],
    tags: [],
    lists: [],
    highlights: [],
    readingProgress: [],
  };
}

interface SeededUserState {
  manifest: SeededUserManifest;
  client: TrpcClient;
  tags: ZTagBasic[];
  manualLists: ZBookmarkList[];
}

async function seedUser(
  client: TrpcClient,
  apiKey: string,
  user: (typeof USERS)[number],
  dataset: UserDataset,
  repoRoot: string,
): Promise<SeededUserState> {
  logStep(`Seeding ${user.email}`);
  const tags = await seedTags(client, dataset.tagNames);
  const { manualLists, smartLists } = await createLists(client, dataset);
  const links = await createLinkBookmarks(client, dataset, tags, manualLists);
  const texts = await createTextBookmarks(client, dataset, tags);
  const assets = await createAssetBookmarks(client, apiKey, dataset, repoRoot);
  const highlights = await createHighlights(client, dataset, texts);
  const bookmarks = [...links, ...texts, ...assets];
  await waitForCrawls(client, bookmarks);
  const readingProgress = await recordReadingProgress(client, bookmarks);

  const manifest = emptyManifest(user.email);
  manifest.seeded = true;
  manifest.bookmarks = bookmarks;
  manifest.tags = tags.map((tag) => tag.name);
  manifest.lists = [...manualLists, ...smartLists].map((list) => ({
    name: list.name,
    type: list.type,
    parentName:
      list.parentId === manualLists[0]?.id ? manualLists[0].name : null,
    query: list.query ?? null,
  }));
  manifest.highlights = highlights;
  manifest.readingProgress = readingProgress;
  manifest.counts.bookmarks = bookmarks.length;
  manifest.counts.tags = tags.length;
  manifest.counts.manualLists = manualLists.length;
  manifest.counts.smartLists = smartLists.length;
  manifest.counts.highlights = highlights.length;

  return { manifest, client, tags, manualLists };
}

// test1 shares its root list with test2 (accepted, editor) and test3
// (pending, viewer). test2 then adds one of its own bookmarks to the list.
async function seedSharing(
  owner: SeededUserState,
  editor: SeededUserState,
  pendingViewer: { email: string },
): Promise<SharingManifest> {
  logStep("Seeding a shared list");
  const list = owner.manualLists[0];
  await owner.client.lists.addCollaborator.mutate({
    listId: list.id,
    email: editor.manifest.email,
    role: "editor",
  });
  const invitations = await editor.client.lists.getPendingInvitations.query();
  const invitation = invitations.find((inv) => inv.listId === list.id);
  if (!invitation) {
    throw new Error(`No pending invitation for ${editor.manifest.email}`);
  }
  await editor.client.lists.acceptInvitation.mutate({
    invitationId: invitation.id,
  });

  await owner.client.lists.addCollaborator.mutate({
    listId: list.id,
    email: pendingViewer.email,
    role: "viewer",
  });

  const editorBookmark = editor.manifest.bookmarks.find(
    (b) => b.type === "link",
  );
  if (!editorBookmark) {
    throw new Error(`${editor.manifest.email} has no link bookmarks`);
  }
  await editor.client.lists.addToList.mutate({
    listId: list.id,
    bookmarkId: editorBookmark.id,
  });
  logSuccess(`Shared "${list.name}"`);

  return {
    ownerEmail: owner.manifest.email,
    listName: list.name,
    collaborators: [
      { email: editor.manifest.email, role: "editor", status: "accepted" },
      { email: pendingViewer.email, role: "viewer", status: "pending" },
    ],
    bookmarksAddedByCollaborators: [
      { email: editor.manifest.email, title: editorBookmark.title },
    ],
  };
}

async function seedSettingsAndAutomation(state: SeededUserState) {
  logStep(
    `Seeding settings, rules, prompts and feeds for ${state.manifest.email}`,
  );
  const { client, tags, manualLists, manifest } = state;

  await client.users.updateSettings.mutate({
    bookmarkClickAction: "expand_bookmark_preview",
    archiveDisplayBehaviour: "hide",
    timezone: "Europe/London",
    backupsEnabled: true,
    backupsFrequency: "weekly",
    backupsRetentionDays: 14,
    readerFontSize: 18,
    readerLineHeight: 1.6,
    readerFontFamily: "serif",
  });

  await client.rules.create.mutate({
    name: "Tag GitHub links",
    description: "Seed snapshot rule",
    enabled: true,
    event: { type: "bookmarkAdded" },
    condition: { type: "urlContains", str: "github.com" },
    actions: [
      { type: "addTag", tagId: tags[0].id },
      { type: "addToList", listId: manualLists[1].id },
    ],
  });
  await client.rules.create.mutate({
    name: "Favourite tagged docs",
    description: null,
    enabled: false,
    event: { type: "tagAdded", tagId: tags[1].id },
    condition: {
      type: "and",
      conditions: [
        { type: "bookmarkTypeIs", bookmarkType: "link" },
        { type: "titleContains", str: "Seed" },
      ],
    },
    actions: [{ type: "favouriteBookmark" }],
  });
  manifest.counts.rules = 2;

  await client.prompts.create.mutate({
    text: "Prefer short, lowercase tags.",
    appliesTo: "all_tagging",
  });
  await client.prompts.create.mutate({
    text: "Keep summaries under three sentences.",
    appliesTo: "summary",
  });
  manifest.counts.prompts = 2;

  // Disabled so the feed worker doesn't import a moving set of bookmarks.
  await client.feeds.create.mutate({
    name: "Karakeep releases",
    url: "https://github.com/karakeep-app/karakeep/releases.atom",
    enabled: false,
    importTags: false,
  });
  manifest.counts.feeds = 1;
}

async function seedImportSession(state: SeededUserState) {
  logStep(`Seeding an import session for ${state.manifest.email}`);
  const { client, manifest } = state;
  const { id } = await client.importSessions.createImportSession.mutate({
    name: "Seed snapshot import",
    rootListId: state.manualLists[0].id,
  });
  const imported = [
    {
      type: "text" as const,
      title: "Seed snapshot imported note 1",
      content: "Imported from another read-it-later app.",
      tags: ["imported"],
      listIds: [],
    },
    {
      type: "text" as const,
      title: "Seed snapshot imported note 2",
      content: "Another imported note, archived on import.",
      note: "Imported with a note",
      tags: ["imported", "archive"],
      listIds: [],
      archived: true,
    },
  ];
  await client.importSessions.stageImportedBookmarks.mutate({
    importSessionId: id,
    bookmarks: imported,
  });
  await client.importSessions.finalizeImportStaging.mutate({
    importSessionId: id,
  });
  await waitUntil(
    async () => {
      const stats = await client.importSessions.getImportSessionStats.query({
        importSessionId: id,
      });
      return stats.status === "completed" || stats.status === "failed";
    },
    "Import session to finish",
    Number(process.env.SEED_SNAPSHOT_IMPORT_TIMEOUT_MS ?? 120_000),
    2_000,
  );
  const stats = await client.importSessions.getImportSessionStats.query({
    importSessionId: id,
  });
  // A session is "completed" once nothing is pending, even if items failed.
  if (
    stats.status !== "completed" ||
    stats.failedBookmarks > 0 ||
    stats.completedBookmarks !== imported.length
  ) {
    throw new Error(
      `Import session ${stats.status}: ${stats.completedBookmarks}/${imported.length} completed, ${stats.failedBookmarks} failed`,
    );
  }
  logSuccess(`Import session completed: ${imported.length} bookmarks`);

  const { items } = await client.importSessions.getImportSessionResults.query({
    importSessionId: id,
    limit: imported.length,
  });
  for (const item of items) {
    if (!item.resultBookmarkId) {
      throw new Error(`Imported "${item.title}" has no resulting bookmark`);
    }
    const entry = imported.find((e) => e.title === item.title);
    manifest.bookmarks.push({
      id: item.resultBookmarkId,
      type: "text",
      url: null,
      title: item.title ?? "",
      crawlStatus: null,
      note: entry && "note" in entry ? (entry.note ?? null) : null,
    });
  }
  // The import creates tags the user didn't have yet.
  for (const tag of imported.flatMap((e) => e.tags)) {
    if (!manifest.tags.includes(tag)) manifest.tags.push(tag);
  }
  manifest.counts.importSessions = 1;
  manifest.counts.bookmarks = manifest.bookmarks.length;
  manifest.counts.tags = manifest.tags.length;
}

// Created last, so none of the seeding above fires it.
async function seedWebhook(state: SeededUserState) {
  await state.client.webhooks.create.mutate({
    url: "https://example.com/karakeep-seed-webhook",
    events: ["created", "crawled"],
    token: "seed-snapshot-token",
  });
  state.manifest.counts.webhooks = 1;
}

async function createUsersAndSeedData(repoRoot: string): Promise<{
  users: SeededUserManifest[];
  sharing: SharingManifest[];
}> {
  const authlessClient = getTrpcClient();

  logStep("Creating seed users");
  const clients = new Map<string, { client: TrpcClient; apiKey: string }>();
  for (const user of USERS) {
    clients.set(
      user.email,
      await createUser(authlessClient, user.email, user.name),
    );
  }

  const seeded = new Map<string, SeededUserState>();
  const manifests: SeededUserManifest[] = [];
  for (const user of USERS) {
    const { client, apiKey } = clients.get(user.email)!;
    if (!user.datasetKey) {
      const manifest = emptyManifest(user.email);
      manifests.push(manifest);
      logSuccess(`${user.email} left empty`);
      continue;
    }
    const state = await seedUser(
      client,
      apiKey,
      user,
      USER_DATASETS[user.datasetKey],
      repoRoot,
    );
    seeded.set(user.email, state);
    manifests.push(state.manifest);
  }

  const test1 = seeded.get("test1@example.com")!;
  const test2 = seeded.get("test2@example.com")!;
  const sharing = [
    await seedSharing(test1, test2, { email: "test3@example.com" }),
  ];
  await seedSettingsAndAutomation(test1);
  await seedImportSession(test2);
  await seedWebhook(test1);

  // Let the background queues (rule engine, search indexing, asset
  // preprocessing) drain before the data dir is archived.
  await sleep(Number(process.env.SEED_SNAPSHOT_SETTLE_MS ?? 15_000));

  return { users: manifests, sharing };
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

function gitRevParse(repoRoot: string, rev: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--verify", "--quiet", rev], {
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
  image: string;
  options: Options;
  users: SeededUserManifest[];
  sharing: SharingManifest[];
}): Promise<void> {
  const snapshotsDir = path.join(params.repoRoot, "snapshots");
  await fs.mkdir(snapshotsDir, { recursive: true });

  const createdAt = new Date();
  const release = params.options.release;
  const baseName = release
    ? `seed-data-v${release}`
    : `seed-data-${formatSnapshotTimestamp(createdAt)}`;
  const archiveName = `${baseName}.tar.gz`;
  const manifestName = `${baseName}.json`;
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

  const headCommit = gitRevParse(params.repoRoot, "HEAD");
  const manifest: SnapshotManifest = {
    createdAt: createdAt.toISOString(),
    karakeepVersion: release ?? "dev",
    image: params.image,
    sourceCommit: release
      ? gitRevParse(params.repoRoot, `v${release}^{commit}`)
      : headCommit,
    generatorCommit: headCommit,
    archive: archiveName,
    users: params.users,
    sharing: params.sharing,
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  logSuccess(`Wrote ${archivePath}`);
  logSuccess(`Wrote ${manifestPath}`);
}

// On Linux the container writes the data dir as root, so a previous run's
// leftovers can't be removed as the current user. Fall back to deleting them
// from inside a container.
async function removeDataDir(dataDir: string): Promise<void> {
  try {
    await fs.rm(dataDir, { force: true, recursive: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EACCES" && code !== "EPERM") throw error;
    logInfo("Removing the previous data dir through docker");
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${path.dirname(dataDir)}:/work`,
        "alpine:3",
        "rm",
        "-rf",
        `/work/${path.basename(dataDir)}`,
      ],
      { stdio: "inherit" },
    );
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.join(__dirname, "..");
  const repoRoot = path.join(packageRoot, "..", "..");
  const composeDir = packageRoot;
  const dataDir = path.join(packageRoot, ".tmp", "data");
  const image = options.release
    ? `${RELEASE_IMAGE_REPO}:${options.release}`
    : LOCAL_IMAGE;

  // Release snapshots are upgrade fixtures, and regenerating one changes its
  // live-crawled data. Checked up front, before spending minutes seeding.
  if (options.release && !options.replace) {
    const existing = [".tar.gz", ".json"]
      .map((ext) =>
        path.join(repoRoot, "snapshots", `seed-data-v${options.release}${ext}`),
      )
      .filter((file) => existsSync(file));
    if (existing.length > 0) {
      throw new Error(
        `${existing.map((f) => path.relative(repoRoot, f)).join(" and ")} already exist. Pass --replace to regenerate them.`,
      );
    }
  }

  await removeDataDir(dataDir);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.chmod(dataDir, 0o777);

  const running = await startContainers(composeDir, dataDir, image, options);

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
    const { users, sharing } = await createUsersAndSeedData(repoRoot);
    await stopContainers();
    await writeSnapshot({ dataDir, repoRoot, image, options, users, sharing });
    logSuccess("Seed snapshot complete");
  } catch (error) {
    logWarn("Seed snapshot failed");
    console.error(error);
    await stopContainers();
    process.exitCode = 1;
  }
}

main();
