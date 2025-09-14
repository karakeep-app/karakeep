import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { getGlobalOptions } from "@/lib/globals";
import { printErrorMessageWithReason, printStatusMessage } from "@/lib/output";
import { getAPIClient } from "@/lib/trpc";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";

import { MAX_NUM_BOOKMARKS_PER_PAGE } from "@karakeep/shared/types/bookmarks";
import { ZCursor } from "@karakeep/shared/types/pagination";

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

export const wipeCmd = new Command()
  .name("wipe")
  .description("wipe all data for the current user from the server")
  .option("-y, --yes", "skip confirmation prompt")
  .option("--exclude-lists", "exclude lists from deletion")
  .option("--exclude-ai-prompts", "exclude AI prompts from deletion")
  .option("--exclude-rules", "exclude rules from deletion")
  .option("--exclude-feeds", "exclude RSS feeds from deletion")
  .option("--exclude-webhooks", "exclude webhooks from deletion")
  .option("--exclude-bookmarks", "exclude bookmarks from deletion")
  .option("--exclude-tags", "exclude tags cleanup from deletion")
  .option("--exclude-user-settings", "exclude user settings (no-op)")
  .option(
    "--batch-size <n>",
    `number of bookmarks per page (max ${MAX_NUM_BOOKMARKS_PER_PAGE})`,
    (v) => Math.min(Number(v || 50), MAX_NUM_BOOKMARKS_PER_PAGE),
    50,
  )
  .action(async (opts) => {
    const globals = getGlobalOptions();
    const api = getAPIClient();

    if (!opts.yes) {
      const rl = readline.createInterface({ input, output });
      const answer = (
        await rl.question(
          `This will permanently delete ALL your data on "${globals.serverAddr}". Proceed? (yes/no): `,
        )
      )
        .trim()
        .toLowerCase();
      rl.close();
      if (answer !== "y" && answer !== "yes") {
        printStatusMessage(false, "Wipe aborted by user");
        return;
      }
    }

    try {
      line("");
      line(`${chalk.bold("Karakeep Wipe")}`);
      line(`${chalk.gray("Server:")} ${globals.serverAddr}`);
      line("");

      // Pre-fetch stats for user feedback
      let totalBookmarks: number | undefined = undefined;
      try {
        const stats = await api.users.stats.query();
        totalBookmarks = stats.numBookmarks;
      } catch {
        // ignore stats errors; progress will show without total
      }

      // 1) Rules
      if (!opts.excludeRules) {
        stepStart("Deleting rule engine rules");
        const rulesStart = Date.now();
        const rulesDeleted = await wipeRules(api, (deleted, total) => {
          progressUpdate("Rules", deleted, total);
        });
        progressDone();
        stepEndSuccess(
          `${rulesDeleted} deleted in ${Math.round((Date.now() - rulesStart) / 1000)}s`,
        );
      }

      // 2) Feeds
      if (!opts.excludeFeeds) {
        stepStart("Deleting feeds");
        const feedsStart = Date.now();
        const feedsDeleted = await wipeFeeds(api, (deleted, total) => {
          progressUpdate("Feeds", deleted, total);
        });
        progressDone();
        stepEndSuccess(
          `${feedsDeleted} deleted in ${Math.round((Date.now() - feedsStart) / 1000)}s`,
        );
      }

      // 3) Webhooks
      if (!opts.excludeWebhooks) {
        stepStart("Deleting webhooks");
        const webhooksStart = Date.now();
        const webhooksDeleted = await wipeWebhooks(api, (deleted, total) => {
          progressUpdate("Webhooks", deleted, total);
        });
        progressDone();
        stepEndSuccess(
          `${webhooksDeleted} deleted in ${Math.round((Date.now() - webhooksStart) / 1000)}s`,
        );
      }

      // 4) Prompts
      if (!opts.excludeAiPrompts) {
        stepStart("Deleting AI prompts");
        const promptsStart = Date.now();
        const promptsDeleted = await wipePrompts(api, (deleted, total) => {
          progressUpdate("Prompts", deleted, total);
        });
        progressDone();
        stepEndSuccess(
          `${promptsDeleted} deleted in ${Math.round((Date.now() - promptsStart) / 1000)}s`,
        );
      }

      // 5) Bookmarks
      if (!opts.excludeBookmarks) {
        stepStart("Deleting bookmarks");
        const bmStart = Date.now();
        const bookmarksDeleted = await wipeBookmarks(api, {
          pageSize: Number(opts.batchSize) || 50,
          total: totalBookmarks,
          onProgress: (deleted, total) => {
            progressUpdate("Bookmarks", deleted, total);
          },
        });
        progressDone();
        stepEndSuccess(
          `${bookmarksDeleted} deleted in ${Math.round((Date.now() - bmStart) / 1000)}s`,
        );
      }

      // 6) Lists
      if (!opts.excludeLists) {
        stepStart("Deleting lists");
        const listsStart = Date.now();
        const listsDeleted = await wipeLists(api, (deleted, total) => {
          progressUpdate("Lists", deleted, total);
        });
        progressDone();
        stepEndSuccess(
          `${listsDeleted} deleted in ${Math.round((Date.now() - listsStart) / 1000)}s`,
        );
      }

      // 7) Tags (unused)
      if (!opts.excludeTags) {
        stepStart("Deleting unused tags");
        const tagsStart = Date.now();
        const deletedTags = await wipeTags(api);
        stepEndSuccess(
          `${deletedTags} deleted in ${Math.round((Date.now() - tagsStart) / 1000)}s`,
        );
      }

      printStatusMessage(true, "Wipe completed successfully");
    } catch (error) {
      stepEndFail();
      printErrorMessageWithReason("Wipe failed", error as object);
    }
  });

async function wipeRules(
  api: ReturnType<typeof getAPIClient>,
  onProgress?: (deleted: number, total: number) => void,
) {
  try {
    const { rules } = await api.rules.list.query();
    let deleted = 0;
    for (const r of rules) {
      try {
        await api.rules.delete.mutate({ id: r.id });
        deleted++;
        onProgress?.(deleted, rules.length);
      } catch (e) {
        printErrorMessageWithReason(
          `Failed deleting rule "${r.id}"`,
          e as object,
        );
      }
    }
    return deleted;
  } catch (error) {
    printErrorMessageWithReason("Failed deleting rules", error as object);
    throw error;
  }
}

async function wipeFeeds(
  api: ReturnType<typeof getAPIClient>,
  onProgress?: (deleted: number, total: number) => void,
) {
  try {
    const { feeds } = await api.feeds.list.query();
    let deleted = 0;
    for (const f of feeds) {
      try {
        await api.feeds.delete.mutate({ feedId: f.id });
        deleted++;
        onProgress?.(deleted, feeds.length);
      } catch (e) {
        printErrorMessageWithReason(
          `Failed deleting feed "${f.id}"`,
          e as object,
        );
      }
    }
    return deleted;
  } catch (error) {
    printErrorMessageWithReason("Failed deleting feeds", error as object);
    throw error;
  }
}

async function wipeWebhooks(
  api: ReturnType<typeof getAPIClient>,
  onProgress?: (deleted: number, total: number) => void,
) {
  try {
    const { webhooks } = await api.webhooks.list.query();
    let deleted = 0;
    for (const w of webhooks) {
      try {
        await api.webhooks.delete.mutate({ webhookId: w.id });
        deleted++;
        onProgress?.(deleted, webhooks.length);
      } catch (e) {
        printErrorMessageWithReason(
          `Failed deleting webhook "${w.id}"`,
          e as object,
        );
      }
    }
    return deleted;
  } catch (error) {
    printErrorMessageWithReason("Failed deleting webhooks", error as object);
    throw error;
  }
}

async function wipePrompts(
  api: ReturnType<typeof getAPIClient>,
  onProgress?: (deleted: number, total: number) => void,
) {
  try {
    const prompts = await api.prompts.list.query();
    let deleted = 0;
    for (const p of prompts) {
      try {
        await api.prompts.delete.mutate({ promptId: p.id });
        deleted++;
        onProgress?.(deleted, prompts.length);
      } catch (e) {
        printErrorMessageWithReason(
          `Failed deleting prompt "${p.id}"`,
          e as object,
        );
      }
    }
    return deleted;
  } catch (error) {
    printErrorMessageWithReason("Failed deleting AI prompts", error as object);
    throw error;
  }
}

async function wipeBookmarks(
  api: ReturnType<typeof getAPIClient>,
  opts: {
    pageSize: number;
    total?: number;
    onProgress?: (deleted: number, total?: number) => void;
  },
) {
  try {
    let cursor: ZCursor | null | undefined = undefined;
    let deleted = 0;
    while (true) {
      const resp = await api.bookmarks.getBookmarks.query({
        limit: opts.pageSize,
        cursor,
        useCursorV2: true,
        includeContent: false,
      });
      for (const b of resp.bookmarks) {
        try {
          await api.bookmarks.deleteBookmark.mutate({ bookmarkId: b.id });
          deleted++;
          opts.onProgress?.(deleted, opts.total);
        } catch (e) {
          printErrorMessageWithReason(
            `Failed deleting bookmark "${b.id}"`,
            e as object,
          );
        }
      }
      cursor = resp.nextCursor;
      if (!cursor) break;
      opts.onProgress?.(deleted, opts.total);
    }
    return deleted;
  } catch (error) {
    printErrorMessageWithReason("Failed deleting bookmarks", error as object);
    throw error;
  }
}

async function wipeLists(
  api: ReturnType<typeof getAPIClient>,
  onProgress?: (deleted: number, total: number) => void,
) {
  try {
    const { lists } = await api.lists.list.query();
    // Delete child lists first (deepest first)
    const depthCache = new Map<string, number>();
    const byId = new Map(lists.map((l) => [l.id, l]));
    const getDepth = (id: string): number => {
      const cached = depthCache.get(id);
      if (cached != null) return cached;
      let d = 0;
      let cur = byId.get(id);
      const visited = new Set<string>();
      while (cur?.parentId) {
        if (visited.has(cur.parentId)) break; // cycle guard
        visited.add(cur.parentId);
        d++;
        cur = byId.get(cur.parentId);
      }
      depthCache.set(id, d);
      return d;
    };
    const ordered = lists
      .slice()
      .sort((a, b) => getDepth(b.id) - getDepth(a.id));
    let deleted = 0;
    for (const l of ordered) {
      try {
        await api.lists.delete.mutate({ listId: l.id });
        deleted++;
        onProgress?.(deleted, lists.length);
      } catch (e) {
        printErrorMessageWithReason(
          `Failed deleting list "${l.id}"`,
          e as object,
        );
      }
    }
    return deleted;
  } catch (error) {
    printErrorMessageWithReason("Failed deleting lists", error as object);
    throw error;
  }
}

async function wipeTags(api: ReturnType<typeof getAPIClient>) {
  try {
    const res = await api.tags.deleteUnused.mutate();
    return res.deletedTags;
  } catch (error) {
    printErrorMessageWithReason("Failed deleting tags", error as object);
    throw error;
  }
}
