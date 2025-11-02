import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getGlobalOptions } from "@/lib/globals";
import { printErrorMessageWithReason, printStatusMessage } from "@/lib/output";
import { getAPIClient } from "@/lib/trpc";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import { MAX_NUM_BOOKMARKS_PER_PAGE } from "@karakeep/shared/types/bookmarks";
import { ZCursor } from "@karakeep/shared/types/pagination";
import { MAX_NUM_TAGS_PER_PAGE } from "@karakeep/shared/types/tags";

const OK = chalk.green("✓");
const FAIL = chalk.red("✗");
const DOTS = chalk.gray("…");

function line(msg: string) {
  console.log(msg);
}

function stepStart(title: string) {
  console.log(`${chalk.cyan(title)} ${DOTS}`);
}

function stepEndSuccess(extra?: string) {
  process.stdout.write(`${OK}${extra ? " " + chalk.gray(extra) : ""}\n`);
}

function stepEndFail(extra?: string) {
  process.stdout.write(`${FAIL}${extra ? " " + chalk.gray(extra) : ""}\n`);
}

function progressUpdate(
  prefix: string,
  current: number,
  total?: number,
  suffix?: string,
) {
  const totalPart = total != null ? `/${total}` : "";
  const text = `${chalk.gray(prefix)} ${current}${totalPart}${suffix ? " " + chalk.gray(suffix) : ""}`;
  if (process.stdout.isTTY) {
    try {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(text);
      return;
    } catch {
      // ignore failures
    }
  }
  console.log(text);
}

function progressDone() {
  process.stdout.write("\n");
}

async function ensureDir(p: string) {
  await fsp.mkdir(p, { recursive: true });
}

async function writeJson(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

async function writeJsonl(
  filePath: string,
  items: AsyncIterable<unknown> | Iterable<unknown>,
) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const fh = await fsp.open(filePath, "w");
  try {
    for await (const item of items) {
      await fh.write(JSON.stringify(item) + "\n");
    }
  } finally {
    await fh.close();
  }
}

async function createTarGz(srcDir: string, outFile: string): Promise<void> {
  await ensureDir(path.dirname(outFile));
  await new Promise<void>((resolve, reject) => {
    const tar = spawn("tar", ["-czf", outFile, "-C", srcDir, "."], {
      stdio: "inherit",
    });
    tar.on("error", reject);
    tar.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited with code ${code}`));
    });
  });
}

export const dumpCmd = new Command()
  .name("dump")
  .description("dump all account data and assets into an archive")
  .option("--output <file>", "output archive path (.tar.gz)")
  .option(
    "--exclude-assets",
    "exclude binary assets (skip assets index and files)",
  )
  .option("--exclude-bookmarks", "exclude bookmarks (metadata/content)")
  .option("--exclude-lists", "exclude lists and list membership")
  .option("--exclude-tags", "exclude tags")
  .option("--exclude-ai-prompts", "exclude AI prompts")
  .option("--exclude-rules", "exclude rule engine rules")
  .option("--exclude-feeds", "exclude RSS feeds")
  .option("--exclude-webhooks", "exclude webhooks")
  .option("--exclude-user-settings", "exclude user settings")
  .option("--exclude-link-content", "exclude link content")
  .option(
    "--batch-size <n>",
    `number of bookmarks per page (max ${MAX_NUM_BOOKMARKS_PER_PAGE})`,
    (v) => Math.min(Number(v || 50), MAX_NUM_BOOKMARKS_PER_PAGE),
    50,
  )
  .action(async (opts) => {
    const api = getAPIClient();
    const globals = getGlobalOptions();

    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace("Z", "Z");
    const workRoot = await fsp.mkdtemp(
      path.join(os.tmpdir(), `karakeep-dump-${ts}-`),
    );
    const outFile = opts.output ?? path.resolve(`karakeep-dump-${ts}.tar.gz`);

    try {
      line("");
      line(`${chalk.bold("Karakeep Dump")}`);
      line(`${chalk.gray("Server:")} ${globals.serverAddr}`);
      line(`${chalk.gray("Output:")} ${outFile}`);
      line("");

      // Manifest skeleton
      const whoami = await api.users.whoami.query();
      const manifest = {
        format: "karakeep.dump",
        version: 1,
        exportedAt: new Date().toISOString(),
        server: globals.serverAddr,
        user: {
          id: whoami.id,
          email: whoami.email,
          name: whoami.name,
        },
        counts: {
          bookmarks: 0,
          assets: 0,
          lists: 0,
          tags: 0,
          rules: 0,
          feeds: 0,
          webhooks: 0,
          prompts: 0,
        },
      };

      // 1) User settings
      if (!opts.excludeUserSettings) {
        stepStart("Exporting user settings");
        const settings = await api.users.settings.query();
        await writeJson(
          path.join(workRoot, "users", "settings.json"),
          settings,
        );
        stepEndSuccess();
      }

      // 2) Lists
      let lists: ZBookmarkList[] | undefined;
      if (!opts.excludeLists) {
        stepStart("Exporting lists");
        const resp = await api.lists.list.query();
        lists = resp.lists;
        await writeJson(path.join(workRoot, "lists", "index.json"), lists);
        manifest.counts.lists = lists.length;
        stepEndSuccess();
      }

      // 3) Tags
      if (!opts.excludeTags) {
        stepStart("Exporting tags");

        let cursor = null;
        let allTags = [];
        do {
          const { tags, nextCursor } = await api.tags.list.query({
            limit: MAX_NUM_TAGS_PER_PAGE,
            cursor,
          });
          allTags.push(...tags);
          cursor = nextCursor;
        } while (cursor);
        await writeJson(path.join(workRoot, "tags", "index.json"), allTags);
        manifest.counts.tags = allTags.length;
        stepEndSuccess();
      }

      // 4) Rules
      if (!opts.excludeRules) {
        stepStart("Exporting rules");
        const { rules } = await api.rules.list.query();
        await writeJson(path.join(workRoot, "rules", "index.json"), rules);
        manifest.counts.rules = rules.length;
        stepEndSuccess();
      }

      // 5) Feeds
      if (!opts.excludeFeeds) {
        stepStart("Exporting feeds");
        const { feeds } = await api.feeds.list.query();
        await writeJson(path.join(workRoot, "feeds", "index.json"), feeds);
        manifest.counts.feeds = feeds.length;
        stepEndSuccess();
      }

      // 6) Prompts
      if (!opts.excludeAiPrompts) {
        stepStart("Exporting AI prompts");
        const prompts = await api.prompts.list.query();
        await writeJson(path.join(workRoot, "prompts", "index.json"), prompts);
        manifest.counts.prompts = prompts.length;
        stepEndSuccess();
      }

      // 7) Webhooks
      if (!opts.excludeWebhooks) {
        stepStart("Exporting webhooks");
        const webhooks = await api.webhooks.list.query();
        await writeJson(
          path.join(workRoot, "webhooks", "index.json"),
          webhooks.webhooks,
        );
        manifest.counts.webhooks = webhooks.webhooks.length;
        stepEndSuccess();
      }

      // 8) Bookmarks (JSONL + list membership)
      if (!opts.excludeBookmarks) {
        stepStart("Exporting bookmarks (metadata/content)");
        const bookmarkJsonl = path.join(workRoot, "bookmarks", "index.jsonl");
        let bookmarksExported = 0;
        const bookmarkIterator = async function* (): AsyncGenerator<ZBookmark> {
          let cursor: ZCursor | null = null;
          do {
            const resp = await api.bookmarks.getBookmarks.query({
              includeContent: !opts.excludeLinkContent,
              limit: Number(opts.batchSize) || 50,
              cursor,
              useCursorV2: true,
            });
            for (const b of resp.bookmarks) {
              yield b;
              bookmarksExported++;
              progressUpdate("Bookmarks", bookmarksExported);
            }
            cursor = resp.nextCursor;
          } while (cursor);
        };
        await writeJsonl(bookmarkJsonl, bookmarkIterator());
        progressDone();
        manifest.counts.bookmarks = bookmarksExported;
        stepEndSuccess();
      }

      // 9) List membership (listId -> [bookmarkId])
      if (!opts.excludeLists && !opts.excludeBookmarks && lists) {
        stepStart("Exporting list membership");
        const membership = await buildListMembership(api, lists, (p, t) =>
          progressUpdate("Lists scanned", p, t),
        );
        progressDone();
        await writeJson(
          path.join(workRoot, "lists", "membership.json"),
          Object.fromEntries(membership.entries()),
        );
        stepEndSuccess();
      }

      // 10) Assets: index + files
      if (!opts.excludeAssets) {
        stepStart("Exporting assets (binary files)");
        const assetsDir = path.join(workRoot, "assets", "files");
        await ensureDir(assetsDir);
        const assetsIndex: {
          id: string;
          assetType: string;
          size: number;
          contentType: string | null;
          fileName: string | null;
          bookmarkId: string | null;
          filePath: string; // relative inside archive
        }[] = [];
        let assetPageCursor: number | null | undefined = null;
        let downloaded = 0;
        let totalAssets: number | undefined = undefined;
        do {
          const resp = await api.assets.list.query({
            limit: 50,
            cursor: assetPageCursor ?? undefined,
          });
          if (totalAssets == null) totalAssets = resp.totalCount;
          for (const a of resp.assets) {
            const relPath = path.join("assets", "files", a.id);
            const absPath = path.join(workRoot, relPath);
            try {
              await downloadAsset(
                globals.serverAddr,
                globals.apiKey,
                a.id,
                absPath,
              );
              assetsIndex.push({
                id: a.id,
                assetType: a.assetType,
                size: a.size,
                contentType: a.contentType,
                fileName: a.fileName,
                bookmarkId: a.bookmarkId,
                filePath: relPath.replace(/\\/g, "/"),
              });
              downloaded++;
              progressUpdate("Assets", downloaded, totalAssets);
            } catch (e) {
              printErrorMessageWithReason(
                `Failed to download asset "${a.id}"`,
                e as object,
              );
            }
          }
          assetPageCursor = resp.nextCursor;
        } while (assetPageCursor);
        progressDone();
        manifest.counts.assets = downloaded;
        await writeJson(
          path.join(workRoot, "assets", "index.json"),
          assetsIndex,
        );
        stepEndSuccess();
      }

      // 11) Manifest
      stepStart("Writing manifest");
      await writeJson(path.join(workRoot, "manifest.json"), manifest);
      stepEndSuccess();

      // 12) Create archive
      stepStart("Creating archive");
      await createTarGz(workRoot, outFile);
      stepEndSuccess();

      printStatusMessage(true, `Dump completed. File: ${outFile}`);
    } catch (error) {
      stepEndFail();
      printErrorMessageWithReason("Dump failed", error as object);
      throw error;
    } finally {
      // Best-effort cleanup of temp directory
      try {
        await fsp.rm(workRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

async function buildListMembership(
  api: ReturnType<typeof getAPIClient>,
  lists: ZBookmarkList[],
  onProgress?: (processed: number, total: number) => void,
) {
  const result = new Map<string, string[]>(); // listId -> [bookmarkId]
  let processed = 0;
  for (const l of lists) {
    // Only manual lists have explicit membership
    if (l.type !== "manual") {
      processed++;
      onProgress?.(processed, lists.length);
      continue;
    }
    let cursor: ZCursor | null = null;
    const ids: string[] = [];
    do {
      const resp = await api.bookmarks.getBookmarks.query({
        listId: l.id,
        limit: MAX_NUM_BOOKMARKS_PER_PAGE,
        cursor,
        includeContent: false,
        useCursorV2: true,
      });
      for (const b of resp.bookmarks) ids.push(b.id);
      cursor = resp.nextCursor;
    } while (cursor);
    result.set(l.id, ids);
    processed++;
    onProgress?.(processed, lists.length);
  }
  return result;
}

async function downloadAsset(
  serverAddr: string,
  apiKey: string,
  assetId: string,
  destFile: string,
) {
  const url = `${serverAddr}/api/assets/${assetId}`;
  const resp = await fetch(url, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  }
  const arrayBuf = await resp.arrayBuffer();
  await ensureDir(path.dirname(destFile));
  await fsp.writeFile(destFile, Buffer.from(arrayBuf));
}
