import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { getGlobalOptions } from "@/lib/globals";
import { printErrorMessageWithReason, printStatusMessage } from "@/lib/output";
import { getAPIClient, getAPIClientFor } from "@/lib/trpc";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import type { ZPrompt } from "@karakeep/shared/types/prompts";
import type { RuleEngineRule } from "@karakeep/shared/types/rules";
import type { ZGetTagResponse } from "@karakeep/shared/types/tags";
import {
  BookmarkTypes,
  MAX_NUM_BOOKMARKS_PER_PAGE,
} from "@karakeep/shared/types/bookmarks";
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

export const migrateCmd = new Command()
  .name("migrate")
  .description("migrate data from a source server to a destination server")
  .requiredOption(
    "--dest-server <url>",
    "destination server base URL, e.g. https://dest.example.com",
  )
  .requiredOption("--dest-api-key <key>", "API key for the destination server")
  .option("-y, --yes", "skip confirmation prompt")
  .option("--exclude-assets", "exclude assets (skip asset bookmarks)")
  .option("--exclude-lists", "exclude lists and list membership")
  .option("--exclude-ai-prompts", "exclude AI prompts")
  .option("--exclude-rules", "exclude rule engine rules")
  .option("--exclude-feeds", "exclude RSS feeds")
  .option("--exclude-webhooks", "exclude webhooks")
  .option("--exclude-bookmarks", "exclude bookmarks migration")
  .option("--exclude-tags", "exclude tags migration")
  .option("--exclude-user-settings", "exclude user settings migration")
  .option(
    "--batch-size <n>",
    `number of bookmarks per page (max ${MAX_NUM_BOOKMARKS_PER_PAGE})`,
    (v) => Math.min(Number(v || 50), MAX_NUM_BOOKMARKS_PER_PAGE),
    50,
  )
  .action(async (opts) => {
    const globals = getGlobalOptions();
    const src = getAPIClient();
    const dest = getAPIClientFor({
      serverAddr: opts.destServer,
      apiKey: opts.destApiKey,
    });

    if (!opts.yes) {
      const rl = readline.createInterface({ input, output });
      const answer = (
        await rl.question(
          `About to migrate data from "${globals.serverAddr}" to "${opts.destServer}". Proceed? (yes/no): `,
        )
      )
        .trim()
        .toLowerCase();
      rl.close();
      if (answer !== "y" && answer !== "yes") {
        printStatusMessage(false, "Migration aborted by user");
        return;
      }
    }

    try {
      line("");
      line(`${chalk.bold("Karakeep Migration")}`);
      line(`${chalk.gray("From:")} ${globals.serverAddr}`);
      line(`${chalk.gray("To:  ")} ${opts.destServer}`);
      line("");

      // Pre-fetch totals for progress
      let totalBookmarks: number | undefined = undefined;
      try {
        const stats = await src.users.stats.query();
        totalBookmarks = stats.numBookmarks;
      } catch {
        // ignore stats errors; progress will show without total
      }

      // 1) User settings
      if (!opts.excludeUserSettings) {
        stepStart("Migrating user settings");
        await migrateUserSettings(src, dest);
        stepEndSuccess();
      }

      // 2) Lists (and mapping)
      let lists: ZBookmarkList[] = [];
      let listIdMap = new Map<string, string>();
      if (!opts.excludeLists) {
        stepStart("Migrating lists");
        const listsStart = Date.now();
        const listsRes = await migrateLists(
          src,
          dest,
          (created, alreadyExists, total) => {
            progressUpdate("Lists (created)", created + alreadyExists, total);
          },
        );
        lists = listsRes.lists;
        listIdMap = listsRes.listIdMap;
        progressDone();
        stepEndSuccess(
          `${listsRes.createdCount} created in ${Math.round((Date.now() - listsStart) / 1000)}s`,
        );
      }

      // 3) Feeds
      let feedIdMap = new Map<string, string>();
      if (!opts.excludeFeeds) {
        stepStart("Migrating feeds");
        const feedsStart = Date.now();
        const res = await migrateFeeds(src, dest, (created, total) => {
          progressUpdate("Feeds", created, total);
        });
        feedIdMap = res.idMap;
        progressDone();
        stepEndSuccess(
          `${res.count} migrated in ${Math.round((Date.now() - feedsStart) / 1000)}s`,
        );
      }

      // 4) AI settings (custom prompts)
      if (!opts.excludeAiPrompts) {
        stepStart("Migrating AI prompts");
        const promptsStart = Date.now();
        const promptsCount = await migratePrompts(
          src,
          dest,
          (created, total) => {
            progressUpdate("Prompts", created, total);
          },
        );
        progressDone();
        stepEndSuccess(
          `${promptsCount} migrated in ${Math.round((Date.now() - promptsStart) / 1000)}s`,
        );
      }

      // 5) Webhooks (tokens cannot be read; created without token)
      if (!opts.excludeWebhooks) {
        stepStart("Migrating webhooks");
        const webhooksStart = Date.now();
        const webhooksCount = await migrateWebhooks(
          src,
          dest,
          (created, total) => {
            progressUpdate("Webhooks", created, total);
          },
        );
        progressDone();
        stepEndSuccess(
          `${webhooksCount} migrated in ${Math.round((Date.now() - webhooksStart) / 1000)}s`,
        );
      }

      // 6) Tags (build id map for rules)
      let tagIdMap = new Map<string, string>();
      if (!opts.excludeTags) {
        stepStart("Ensuring tags on destination");
        const tagsStart = Date.now();
        const res = await migrateTags(src, dest, (ensured, total) => {
          progressUpdate("Tags", ensured, total);
        });
        tagIdMap = res.idMap;
        progressDone();
        stepEndSuccess(
          `${res.count} ensured in ${Math.round((Date.now() - tagsStart) / 1000)}s`,
        );
      }

      // 7) Rules (requires tag/list/feed id maps)
      if (
        !opts.excludeRules &&
        !opts.excludeLists &&
        !opts.excludeFeeds &&
        !opts.excludeTags
      ) {
        stepStart("Migrating rule engine rules");
        const rulesStart = Date.now();
        const rulesCount = await migrateRules(
          src,
          dest,
          { tagIdMap, listIdMap, feedIdMap },
          (created, total) => {
            progressUpdate("Rules", created, total);
          },
        );
        progressDone();
        stepEndSuccess(
          `${rulesCount} migrated in ${Math.round((Date.now() - rulesStart) / 1000)}s`,
        );
      }

      // 8) Bookmarks (with list membership + tags)
      let bookmarkListsMap = new Map<string, string[]>();
      if (!opts.excludeLists && !opts.excludeBookmarks) {
        stepStart("Building list membership for bookmarks");
        const blmStart = Date.now();
        const res = await buildBookmarkListMembership(
          src,
          lists,
          (processed, total) => {
            progressUpdate("Scanning lists", processed, total);
          },
        );
        bookmarkListsMap = res.bookmarkListsMap;
        progressDone();
        stepEndSuccess(
          `${res.scannedLists} lists scanned in ${Math.round((Date.now() - blmStart) / 1000)}s`,
        );
      }
      if (!opts.excludeBookmarks) {
        stepStart("Migrating bookmarks");
        const bmStart = Date.now();
        const res = await migrateBookmarks(src, dest, {
          pageSize: Number(opts.batchSize) || 50,
          listIdMap,
          bookmarkListsMap,
          total: totalBookmarks,
          onProgress: (migrated, skipped, total) => {
            const suffix =
              skipped > 0 ? `(skipped ${skipped} assets)` : undefined;
            progressUpdate("Bookmarks", migrated, total, suffix);
          },
          srcServer: globals.serverAddr,
          srcApiKey: globals.apiKey,
          destServer: opts.destServer,
          destApiKey: opts.destApiKey,
          excludeAssets: !!opts.excludeAssets,
          excludeLists: !!opts.excludeLists,
        });
        progressDone();
        stepEndSuccess(
          `${res.migrated} migrated${res.skippedAssets ? `, ${res.skippedAssets} skipped` : ""} in ${Math.round((Date.now() - bmStart) / 1000)}s`,
        );
      }

      printStatusMessage(true, "Migration completed successfully");
    } catch (error) {
      stepEndFail();
      printErrorMessageWithReason("Migration failed", error as object);
    }
  });

async function migrateUserSettings(
  src: ReturnType<typeof getAPIClientFor>,
  dest: ReturnType<typeof getAPIClientFor>,
) {
  try {
    const settings = await src.users.settings.query();
    await dest.users.updateSettings.mutate(settings);
  } catch (error) {
    printErrorMessageWithReason(
      "Failed migrating user settings",
      error as object,
    );
    throw error;
  }
}

async function migrateLists(
  src: ReturnType<typeof getAPIClientFor>,
  dest: ReturnType<typeof getAPIClientFor>,
  onProgress?: (created: number, alreadyExists: number, total: number) => void,
) {
  try {
    const { lists } = await src.lists.list.query();
    const destListsResp = await dest.lists.list.query();
    const destLists = destListsResp.lists.slice();

    // Create lists in parent-first order
    const remaining = new Map<string, ZBookmarkList>(
      lists.map((l) => [l.id, l]),
    );
    const created = new Map<string, string>(); // srcId -> destId
    let createdCount = 0;
    let alreadyExistsCount = 0;
    let progress = true;

    while (remaining.size > 0 && progress) {
      progress = false;
      for (const [id, l] of Array.from(remaining.entries())) {
        const parentOk = !l.parentId || created.has(l.parentId);
        if (!parentOk) continue;
        const parentDestId = l.parentId ? created.get(l.parentId)! : undefined;

        // Try to find an existing destination list with the same properties (including parent)
        const match = destLists.find(
          (dl) =>
            dl.name === l.name &&
            dl.icon === l.icon &&
            (dl.description ?? null) === (l.description ?? null) &&
            dl.type === l.type &&
            (dl.query ?? null) === (l.query ?? null) &&
            (dl.parentId ?? undefined) === (parentDestId ?? undefined),
        );

        if (match) {
          created.set(id, match.id);
          // Align public flag if required (best-effort)
          if (typeof l.public === "boolean" && match.public !== l.public) {
            try {
              await dest.lists.edit.mutate({
                listId: match.id,
                public: l.public,
              });
            } catch {
              // ignore failures
            }
          }
          remaining.delete(id);
          progress = true;
          alreadyExistsCount++;
          onProgress?.(createdCount, alreadyExistsCount, lists.length);
        } else {
          const createdList = await dest.lists.create.mutate({
            name: l.name,
            description: l.description ?? undefined,
            icon: l.icon,
            type: l.type,
            query: l.query ?? undefined,
            parentId: parentDestId,
          });
          // Apply visibility if needed
          if (typeof l.public === "boolean") {
            try {
              await dest.lists.edit.mutate({
                listId: createdList.id,
                public: l.public,
              });
            } catch {
              // ignore failures
            }
          }
          // Make newly created list available for subsequent matches
          destLists.push(createdList);

          created.set(id, createdList.id);
          remaining.delete(id);
          progress = true;
          createdCount++;
          onProgress?.(createdCount, alreadyExistsCount, lists.length);
        }
      }
    }

    if (remaining.size > 0) {
      throw new Error(
        "Could not resolve list hierarchy due to missing parents",
      );
    }

    return { lists, listIdMap: created, createdCount };
  } catch (error) {
    printErrorMessageWithReason("Failed migrating lists", error as object);
    throw error;
  }
}

async function migrateFeeds(
  src: ReturnType<typeof getAPIClientFor>,
  dest: ReturnType<typeof getAPIClientFor>,
  onProgress?: (created: number, total: number) => void,
) {
  try {
    const { feeds } = await src.feeds.list.query();
    const idMap = new Map<string, string>();
    let created = 0;
    for (const f of feeds) {
      const nf = await dest.feeds.create.mutate({
        name: f.name,
        url: f.url,
        enabled: f.enabled,
      });
      idMap.set(f.id, nf.id);
      created++;
      onProgress?.(created, feeds.length);
    }
    return { idMap, count: feeds.length };
  } catch (error) {
    printErrorMessageWithReason("Failed migrating feeds", error as object);
    throw error;
  }
}

async function migratePrompts(
  src: ReturnType<typeof getAPIClientFor>,
  dest: ReturnType<typeof getAPIClientFor>,
  onProgress?: (created: number, total: number) => void,
) {
  try {
    const prompts: ZPrompt[] = await src.prompts.list.query();
    let created = 0;
    for (const p of prompts) {
      const np = await dest.prompts.create.mutate({
        text: p.text,
        appliesTo: p.appliesTo,
      });
      if (p.enabled !== np.enabled) {
        await dest.prompts.update.mutate({
          promptId: np.id,
          enabled: p.enabled,
        });
      }
      created++;
      onProgress?.(created, prompts.length);
    }
    // keep output concise; step wrapper prints totals
    return created;
  } catch (error) {
    printErrorMessageWithReason("Failed migrating AI prompts", error as object);
    throw error;
  }
}

async function migrateWebhooks(
  src: ReturnType<typeof getAPIClientFor>,
  dest: ReturnType<typeof getAPIClientFor>,
  onProgress?: (created: number, total: number) => void,
) {
  try {
    const { webhooks } = await src.webhooks.list.query();
    onProgress?.(0, webhooks.length);
    let created = 0;
    for (const w of webhooks) {
      await dest.webhooks.create.mutate({ url: w.url, events: w.events });
      created++;
      onProgress?.(created, webhooks.length);
    }
    return created;
  } catch (error) {
    printErrorMessageWithReason("Failed migrating webhooks", error as object);
    throw error;
  }
}

async function migrateTags(
  src: ReturnType<typeof getAPIClientFor>,
  dest: ReturnType<typeof getAPIClientFor>,
  onProgress?: (ensured: number, total: number) => void,
) {
  try {
    const { tags: srcTags } = await src.tags.list.query({});
    // Create tags by name; ignore if exist
    let ensured = 0;
    for (const t of srcTags) {
      try {
        await dest.tags.create.mutate({ name: t.name });
      } catch {
        // Ignore duplicate errors
      }
      ensured++;
      onProgress?.(ensured, srcTags.length);
    }
    // Build id map using destination's current tags
    const { tags: destTags } = await dest.tags.list.query({});
    const nameToDestId = destTags.reduce<Record<string, string>>((acc, t) => {
      acc[t.name] = t.id;
      return acc;
    }, {});
    const idMap = new Map<string, string>();
    srcTags.forEach((t: ZGetTagResponse) => {
      const destId = nameToDestId[t.name];
      if (destId) idMap.set(t.id, destId);
    });
    return { idMap, count: srcTags.length };
  } catch (error) {
    printErrorMessageWithReason("Failed migrating tags", error as object);
    throw error;
  }
}

interface RuleIdMaps {
  tagIdMap: Map<string, string>;
  listIdMap: Map<string, string>;
  feedIdMap: Map<string, string>;
}

async function migrateRules(
  src: ReturnType<typeof getAPIClientFor>,
  dest: ReturnType<typeof getAPIClientFor>,
  maps: RuleIdMaps,
  onProgress?: (created: number, total: number) => void,
) {
  try {
    const { rules } = await src.rules.list.query();
    let migrated = 0;
    for (const r of rules) {
      try {
        const nr = remapRuleIds(r, maps);
        await dest.rules.create.mutate(nr);
        migrated++;
        onProgress?.(migrated, rules.length);
      } catch (e) {
        printErrorMessageWithReason(
          `Failed migrating rule "${r.id}"`,
          e as object,
        );
      }
    }
    return migrated;
  } catch (error) {
    printErrorMessageWithReason(
      "Failed migrating rule engine rules",
      error as object,
    );
    throw error;
  }
}

function remapRuleIds(
  rule: RuleEngineRule,
  maps: RuleIdMaps,
): Omit<RuleEngineRule, "id"> {
  const mapTag = (id: string) => maps.tagIdMap.get(id) ?? id;
  const mapList = (id: string) => maps.listIdMap.get(id) ?? id;
  const mapFeed = (id: string) => maps.feedIdMap.get(id) ?? id;

  const mapCondition = (
    c: RuleEngineRule["condition"],
  ): RuleEngineRule["condition"] => {
    switch (c.type) {
      case "hasTag":
        return { ...c, tagId: mapTag(c.tagId) };
      case "importedFromFeed":
        return { ...c, feedId: mapFeed(c.feedId) };
      case "and":
      case "or":
        return { ...c, conditions: c.conditions.map(mapCondition) };
      default:
        return c;
    }
  };

  const mapEvent = (e: RuleEngineRule["event"]): RuleEngineRule["event"] => {
    switch (e.type) {
      case "tagAdded":
      case "tagRemoved":
        return { ...e, tagId: mapTag(e.tagId) };
      case "addedToList":
      case "removedFromList":
        return { ...e, listId: mapList(e.listId) };
      default:
        return e;
    }
  };

  const mapAction = (
    a: RuleEngineRule["actions"][number],
  ): RuleEngineRule["actions"][number] => {
    switch (a.type) {
      case "addTag":
      case "removeTag":
        return { ...a, tagId: mapTag(a.tagId) };
      case "addToList":
      case "removeFromList":
        return { ...a, listId: mapList(a.listId) };
      default:
        return a;
    }
  };

  return {
    name: rule.name,
    description: rule.description,
    enabled: rule.enabled,
    event: mapEvent(rule.event),
    condition: mapCondition(rule.condition),
    actions: rule.actions.map(mapAction),
  };
}

async function buildBookmarkListMembership(
  src: ReturnType<typeof getAPIClientFor>,
  srcLists: ZBookmarkList[],
  onProgress?: (processedLists: number, totalLists: number) => void,
) {
  // Build mapping: oldBookmarkId -> [srcListIds]
  const bookmarkToLists = new Map<string, string[]>();
  let processed = 0;
  for (const l of srcLists) {
    if (l.type != "manual") {
      processed++;
      onProgress?.(processed, srcLists.length);
      continue;
    }
    let cursor: ZCursor | null = null;
    do {
      const resp = await src.bookmarks.getBookmarks.query({
        listId: l.id,
        cursor,
        limit: MAX_NUM_BOOKMARKS_PER_PAGE,
        includeContent: false,
      });
      for (const b of resp.bookmarks) {
        if (!bookmarkToLists.has(b.id)) bookmarkToLists.set(b.id, []);
        bookmarkToLists.get(b.id)!.push(l.id);
      }
      cursor = resp.nextCursor;
    } while (cursor);
    processed++;
    onProgress?.(processed, srcLists.length);
  }
  return { bookmarkListsMap: bookmarkToLists, scannedLists: processed };
}

async function migrateBookmarks(
  src: ReturnType<typeof getAPIClientFor>,
  dest: ReturnType<typeof getAPIClientFor>,
  opts: {
    pageSize: number;
    listIdMap: Map<string, string>;
    bookmarkListsMap: Map<string, string[]>; // srcBookmarkId -> srcListIds
    total?: number;
    onProgress?: (
      migrated: number,
      skippedAssets: number,
      total?: number,
    ) => void;
    srcServer: string;
    srcApiKey: string;
    destServer: string;
    destApiKey: string;
    excludeAssets: boolean;
    excludeLists: boolean;
  },
) {
  let cursor: ZCursor | null = null;
  let migrated = 0;
  let skippedAssets = 0;
  while (true) {
    const resp = await src.bookmarks.getBookmarks.query({
      limit: opts.pageSize,
      cursor,
      includeContent: false,
    });
    for (const b of resp.bookmarks as ZBookmark[]) {
      // Create bookmark on destination
      try {
        const common = {
          title: b.title ?? undefined,
          archived: b.archived,
          favourited: b.favourited,
          note: b.note ?? undefined,
          summary: b.summary ?? undefined,
          createdAt: b.createdAt,
          crawlPriority: "low" as const,
        };
        let createdId: string | null = null;
        switch (b.content.type) {
          case BookmarkTypes.LINK: {
            const nb = await dest.bookmarks.createBookmark.mutate({
              ...common,
              type: BookmarkTypes.LINK,
              url: b.content.url,
            });
            createdId = nb.id;
            break;
          }
          case BookmarkTypes.TEXT: {
            const nb = await dest.bookmarks.createBookmark.mutate({
              ...common,
              type: BookmarkTypes.TEXT,
              text: b.content.text,
              sourceUrl: b.content.sourceUrl ?? undefined,
            });
            createdId = nb.id;
            break;
          }
          case BookmarkTypes.ASSET: {
            if (opts.excludeAssets) {
              // Skip migrating asset bookmarks when excluded
              skippedAssets++;
              continue;
            }
            // Download from source and re-upload to destination
            try {
              const downloadResp = await fetch(
                `${opts.srcServer}/api/assets/${b.content.assetId}`,
                {
                  headers: { authorization: `Bearer ${opts.srcApiKey}` },
                },
              );
              if (!downloadResp.ok) {
                throw new Error(
                  `Failed to download asset: ${downloadResp.status} ${downloadResp.statusText}`,
                );
              }
              const srcContentType =
                downloadResp.headers.get("content-type") ??
                "application/octet-stream";
              const arrayBuf = await downloadResp.arrayBuffer();
              const blob = new Blob([arrayBuf], { type: srcContentType });
              const fileName = b.content.fileName ?? `asset-${b.id}`;

              const form = new FormData();
              form.append("file", blob, fileName);
              const uploadResp = await fetch(`${opts.destServer}/api/assets`, {
                method: "POST",
                headers: { authorization: `Bearer ${opts.destApiKey}` },
                body: form,
              });
              if (!uploadResp.ok) {
                throw new Error(
                  `Failed to upload asset: ${uploadResp.status} ${uploadResp.statusText}`,
                );
              }
              const uploaded: {
                assetId: string;
                contentType: string | null;
                size: number | null;
                fileName: string | null;
              } = await uploadResp.json();

              const nb = await dest.bookmarks.createBookmark.mutate({
                ...common,
                type: BookmarkTypes.ASSET,
                assetType: b.content.assetType,
                assetId: uploaded.assetId,
                fileName: uploaded.fileName ?? fileName,
                sourceUrl: b.content.sourceUrl ?? undefined,
              });
              createdId = nb.id;
              break;
            } catch {
              skippedAssets++;
              // Continue with next bookmark after reporting error
              // Optional: print concise error per asset
              // printErrorMessageWithReason(`Failed migrating asset for bookmark "${b.id}"`, e as object);
              continue;
            }
          }
          default: {
            continue;
          }
        }

        // Attach tags by name
        if (b.tags.length > 0) {
          await dest.bookmarks.updateTags.mutate({
            bookmarkId: createdId!,
            attach: b.tags.map((t) => ({ tagName: t.name })),
            detach: [],
          });
        }

        // Add to lists (map src -> dest list ids)
        if (!opts.excludeLists) {
          const srcListIds = opts.bookmarkListsMap.get(b.id) ?? [];
          for (const srcListId of srcListIds) {
            const destListId = opts.listIdMap.get(srcListId);
            if (destListId) {
              await dest.lists.addToList.mutate({
                listId: destListId,
                bookmarkId: createdId!,
              });
            }
          }
        }
        migrated++;
        opts.onProgress?.(migrated, skippedAssets, opts.total);
      } catch (error) {
        printErrorMessageWithReason(
          `Failed migrating bookmark "${b.id}"`,
          error as object,
        );
      }
    }
    cursor = resp.nextCursor;
    if (!cursor) break;
    // Update progress after each page
    opts.onProgress?.(migrated, skippedAssets, opts.total);
  }
  return { migrated, skippedAssets };
}
