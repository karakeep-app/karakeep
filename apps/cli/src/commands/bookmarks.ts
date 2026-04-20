import * as fs from "node:fs";
import * as path from "node:path";
import { addToList } from "@/commands/lists";
import { getGlobalOptions } from "@/lib/globals";
import {
  printError,
  printObject,
  printStatusMessage,
  printSuccess,
} from "@/lib/output";
import { getAPIClient } from "@/lib/trpc";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  BookmarkTypes,
  MAX_NUM_BOOKMARKS_PER_PAGE,
} from "@karakeep/shared/types/bookmarks";

export const bookmarkCmd = new Command()
  .name("bookmarks")
  .description("manipulating bookmarks");

function collect<T>(val: T, acc: T[]) {
  acc.push(val);
  return acc;
}

type Bookmark = Omit<ZBookmark, "tags"> & {
  tags: string[];
};

function normalizeBookmark(bookmark: ZBookmark): Bookmark {
  return {
    ...bookmark,
    tags: bookmark.tags.map((t) => t.name),
  };
}

function printBookmarkDetail(b: ZBookmark) {
  if (getGlobalOptions().json) {
    printObject(normalizeBookmark(b));
    return;
  }

  const title = getBookmarkTitle(b);
  const url = getBookmarkUrl(b);
  const tags = b.tags.map((t) => t.name).join(", ");
  const type =
    b.content.type === BookmarkTypes.ASSET
      ? `asset (${b.content.assetType})`
      : b.content.type;

  console.log(chalk.bold(title));
  console.log(chalk.dim(`  Id:          ${b.id}`));
  console.log(chalk.dim(`  Type:        ${type}`));
  if (url) console.log(`  URL:         ${chalk.cyan(url)}`);
  if (tags) console.log(`  Tags:        ${tags}`);
  if (b.archived) console.log(`  Archived:    yes`);
  if (b.favourited) console.log(`  Favourited:  yes`);
  console.log(`  Created:     ${b.createdAt.toISOString()}`);
  if (b.modifiedAt) console.log(`  Modified:    ${b.modifiedAt.toISOString()}`);
  if (b.source) console.log(`  Source:      ${b.source}`);
  if (b.note) console.log(`  Note:        ${b.note}`);
  if (b.summary) console.log(`  Summary:     ${b.summary}`);

  if (b.content.type === BookmarkTypes.LINK) {
    if (b.content.author) console.log(`  Author:      ${b.content.author}`);
    if (b.content.publisher)
      console.log(`  Publisher:   ${b.content.publisher}`);
    if (b.content.description)
      console.log(`  Description: ${b.content.description}`);
    if (b.content.crawlStatus)
      console.log(`  Crawl:       ${b.content.crawlStatus}`);
  }

  if (b.content.type === BookmarkTypes.TEXT) {
    console.log();
    console.log(b.content.text);
  }

  if (b.assets.length > 0) {
    const serverAddr = getGlobalOptions().serverAddr;
    console.log(`  Attachments:`);
    for (const asset of b.assets) {
      const name = asset.fileName ?? asset.assetType;
      const assetUrl = `${serverAddr}/api/assets/${asset.id}`;
      console.log(`    - ${name} ${chalk.cyan(assetUrl)}`);
    }
  }
  console.log();
}

function getBookmarkTitle(bookmark: ZBookmark): string {
  if (bookmark.title) return bookmark.title;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      return bookmark.content.title ?? bookmark.content.url;
    case BookmarkTypes.TEXT:
      return bookmark.content.text.replaceAll(/\s+/g, " ").substring(0, 50);
    case BookmarkTypes.ASSET:
      return bookmark.content.fileName ?? "asset";
    default:
      return "";
  }
}

function getBookmarkUrl(bookmark: ZBookmark): string {
  if (bookmark.content.type === BookmarkTypes.LINK) {
    return bookmark.content.url;
  }
  if (bookmark.content.type === BookmarkTypes.ASSET) {
    const serverAddr = getGlobalOptions().serverAddr;
    return `${serverAddr}/api/assets/${bookmark.content.assetId}`;
  }
  return "";
}

function printBookmarkCard(b: ZBookmark) {
  const title = getBookmarkTitle(b);
  const url = getBookmarkUrl(b);
  const tags = b.tags.map((t) => t.name).join(", ");

  console.log(chalk.bold(title));
  console.log(chalk.dim(`  Id:   ${b.id}`));
  const type =
    b.content.type === BookmarkTypes.ASSET
      ? `asset (${b.content.assetType})`
      : b.content.type;
  console.log(chalk.dim(`  Type: ${type}`));
  console.log(chalk.dim(`  Created: ${b.createdAt.toISOString()}`));
  if (url) console.log(`  URL:  ${chalk.cyan(url)}`);
  if (b.content.type === BookmarkTypes.LINK) {
    if (b.content.author) console.log(`  Author: ${b.content.author}`);
    if (b.content.publisher) console.log(`  Publisher: ${b.content.publisher}`);
  }
  if (tags) console.log(`  Tags: ${tags}`);
  if (b.archived) console.log(`  Archived: yes`);
  if (b.favourited) console.log(`  Favourited: yes`);
  if (b.note) console.log(`  Note: ${b.note}`);
  console.log();
}

bookmarkCmd
  .command("add")
  .description("creates a new bookmark")
  .option(
    "--link <link>",
    "the link to add. Specify multiple times to add multiple links",
    collect<string>,
    [],
  )
  .option(
    "--note <note>",
    "the note text to add. Specify multiple times to add multiple notes",
    collect<string>,
    [],
  )
  .option(
    "--asset <file>",
    "the file path of an asset (image or pdf) to add. Specify multiple times to add multiple assets",
    collect<string>,
    [],
  )
  .option("--stdin", "reads the data from stdin and store it as a note")
  .option(
    "--list-id <id>",
    "if set, the bookmark(s) will be added to this list",
  )
  .option(
    "--tag-name <tag>",
    "if set, this tag will be added to the bookmark(s). Specify multiple times to add multiple tags",
    collect<string>,
    [],
  )
  .option(
    "--title <title>",
    "if set, this will be used as the bookmark's title",
  )
  .action(async (opts) => {
    const api = getAPIClient();

    const results: Bookmark[] = [];

    const promises = [
      ...opts.link.map((url) =>
        api.bookmarks.createBookmark
          .mutate({
            type: BookmarkTypes.LINK,
            url,
            title: opts.title,
            source: "cli",
          })
          .then((bookmark: ZBookmark) => {
            results.push(normalizeBookmark(bookmark));
          })
          .catch(printError(`Failed to add a link bookmark for url "${url}"`)),
      ),
      ...opts.note.map((text) =>
        api.bookmarks.createBookmark
          .mutate({
            type: BookmarkTypes.TEXT,
            text,
            title: opts.title,
            source: "cli",
          })
          .then((bookmark: ZBookmark) => {
            results.push(normalizeBookmark(bookmark));
          })
          .catch(
            printError(
              `Failed to add a text bookmark with text "${text.substring(0, 50)}"`,
            ),
          ),
      ),
    ];

    if (opts.stdin) {
      const text = fs.readFileSync(0, "utf-8");
      promises.push(
        api.bookmarks.createBookmark
          .mutate({
            type: BookmarkTypes.TEXT,
            text,
            title: opts.title,
            source: "cli",
          })
          .then((bookmark: ZBookmark) => {
            results.push(normalizeBookmark(bookmark));
          })
          .catch(
            printError(
              `Failed to add a text bookmark with text "${text.substring(0, 50)}"`,
            ),
          ),
      );
    }

    const globals = getGlobalOptions();
    for (const filePath of opts.asset) {
      promises.push(
        (async () => {
          const fileBuffer = fs.readFileSync(filePath);
          const fileName = path.basename(filePath);
          const formData = new FormData();
          formData.append("file", new Blob([fileBuffer]), fileName);

          const uploadResp = await fetch(
            `${globals.serverAddr}/api/v1/assets`,
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${globals.apiKey}`,
              },
              body: formData,
            },
          );
          if (!uploadResp.ok) {
            throw new Error(
              `Upload failed: ${uploadResp.status} ${uploadResp.statusText}`,
            );
          }
          const { assetId, contentType } = (await uploadResp.json()) as {
            assetId: string;
            contentType: string;
          };
          const assetType = contentType === "application/pdf" ? "pdf" : "image";

          const bookmark = await api.bookmarks.createBookmark.mutate({
            type: BookmarkTypes.ASSET,
            assetType,
            assetId,
            fileName,
            title: opts.title,
            source: "cli",
          });
          results.push(normalizeBookmark(bookmark));
        })().catch(
          printError(`Failed to add an asset bookmark for file "${filePath}"`),
        ),
      );
    }

    await Promise.allSettled(promises);
    printObject(results);

    await Promise.allSettled(
      results.flatMap((r) => [
        updateTags(opts.tagName, [], r.id),
        opts.listId ? addToList(opts.listId, r.id) : Promise.resolve(),
      ]),
    );
  });

bookmarkCmd
  .command("get")
  .description("fetch information about a bookmark")
  .argument("<id>", "The id of the bookmark to get")
  .option(
    "--include-content",
    "include full bookmark content in results",
    false,
  )
  .action(async (id, opts) => {
    const api = getAPIClient();
    await api.bookmarks.getBookmark
      .query({ bookmarkId: id, includeContent: opts.includeContent })
      .then(printBookmarkDetail)
      .catch(printError(`Failed to get the bookmark with id "${id}"`));
  });

function printTagMessage(
  tags: { tagName: string }[],
  bookmarkId: string,
  action: "Added" | "Removed",
) {
  tags.forEach((tag) => {
    printStatusMessage(
      true,
      `${action} the tag ${tag.tagName} ${action === "Added" ? "to" : "from"} the bookmark with id ${bookmarkId}`,
    );
  });
}

async function updateTags(addTags: string[], removeTags: string[], id: string) {
  const tagsToAdd = addTags.map((addTag) => {
    return { tagName: addTag };
  });

  const tagsToRemove = removeTags.map((removeTag) => {
    return { tagName: removeTag };
  });

  if (tagsToAdd.length > 0 || tagsToRemove.length > 0) {
    const api = getAPIClient();
    await api.bookmarks.updateTags
      .mutate({
        bookmarkId: id,
        attach: tagsToAdd,
        detach: tagsToRemove,
      })
      .then(() => {
        printTagMessage(tagsToAdd, id, "Added");
        printTagMessage(tagsToRemove, id, "Removed");
      })
      .catch(
        printError(
          `Failed to add/remove tags to/from bookmark with id "${id}"`,
        ),
      );
  }
}

bookmarkCmd
  .command("update")
  .description("update a bookmark")
  .option("--title <title>", "if set, the bookmark's title will be updated")
  .option("--note <note>", "if set, the bookmark's note will be updated")
  .option("--archive", "if set, the bookmark will be archived")
  .option("--no-archive", "if set, the bookmark will be unarchived")
  .option("--favourite", "if set, the bookmark will be favourited")
  .option("--no-favourite", "if set, the bookmark will be unfavourited")
  .argument("<id>", "the id of the bookmark to update")
  .action(async (id, opts) => {
    const api = getAPIClient();
    await api.bookmarks.updateBookmark
      .mutate({
        bookmarkId: id,
        archived: opts.archive,
        favourited: opts.favourite,
        title: opts.title,
        note: opts.note,
      })
      .then(printObject)
      .catch(printError(`Failed to update bookmark with id "${id}"`));
  });

bookmarkCmd
  .command("update-tags")
  .description("update the tags of a bookmark")
  .option(
    "--add-tag <tag>",
    "if set, this tag will be added to the bookmark. Specify multiple times to add multiple tags",
    collect<string>,
    [],
  )
  .option(
    "--remove-tag <tag>",
    "if set, this tag will be removed from the bookmark. Specify multiple times to remove multiple tags",
    collect<string>,
    [],
  )
  .argument("<id>", "the id of the bookmark to update")
  .action(async (id, opts) => {
    await updateTags(opts.addTag, opts.removeTag, id);
  });

bookmarkCmd
  .command("list")
  .description("list bookmarks")
  .option(
    "--include-archived",
    "If set, archived bookmarks will be fetched as well",
    false,
  )
  .option("--list-id <id>", "if set, only items from that list will be fetched")
  .option("--tag-id <id>", "if set, only items with that tag will be fetched")
  .option(
    "--feed-id <id>",
    "if set, only items from that RSS feed will be fetched",
  )
  .option(
    "--include-content",
    "include full bookmark content in results",
    false,
  )
  .option(
    "--limit <limit>",
    `number of bookmarks per page (max ${MAX_NUM_BOOKMARKS_PER_PAGE})`,
    (v: string) => Math.min(parseInt(v, 10), MAX_NUM_BOOKMARKS_PER_PAGE),
    20,
  )
  .option("--all", "fetch all bookmarks (paginate through all pages)", false)
  .option("--cursor <cursor>", "cursor from a previous request for pagination")
  .action(async (opts) => {
    const api = getAPIClient();

    const request = {
      archived: opts.includeArchived ? undefined : false,
      listId: opts.listId,
      tagId: opts.tagId,
      rssFeedId: opts.feedId,
      limit: opts.limit,
      useCursorV2: true,
      includeContent: opts.includeContent,
      cursor: opts.cursor
        ? JSON.parse(Buffer.from(opts.cursor, "base64").toString(), (k, v) =>
            k === "createdAt" ? new Date(v) : v,
          )
        : undefined,
    };

    try {
      let resp = await api.bookmarks.getBookmarks.query(request);
      let results: ZBookmark[] = resp.bookmarks;

      if (opts.all) {
        while (resp.nextCursor) {
          resp = await api.bookmarks.getBookmarks.query({
            ...request,
            cursor: resp.nextCursor,
          });
          results = [...results, ...resp.bookmarks];
        }
      }

      const nextCursor =
        !opts.all && resp.nextCursor
          ? Buffer.from(JSON.stringify(resp.nextCursor)).toString("base64")
          : undefined;

      if (getGlobalOptions().json) {
        printObject(
          { bookmarks: results.map(normalizeBookmark), nextCursor },
          { maxArrayLength: null },
        );
      } else {
        results.forEach(printBookmarkCard);
        if (nextCursor) {
          console.log(`Next cursor: ${chalk.dim(nextCursor)}`);
        }
      }
    } catch {
      printStatusMessage(false, "Failed to query bookmarks");
    }
  });

bookmarkCmd
  .command("search")
  .description("search bookmarks using query matchers")
  .argument(
    "<query>",
    "the search query (supports matchers like tag:name, is:fav, etc.)",
  )
  .option(
    "--limit <limit>",
    "number of results per page",
    (val) => parseInt(val, 10),
    50,
  )
  .option(
    "--sort-order <order>",
    "sort order for results",
    (val) => {
      if (val !== "relevance" && val !== "asc" && val !== "desc") {
        throw new Error("sort-order must be one of: relevance, asc, desc");
      }
      return val;
    },
    "relevance",
  )
  .option(
    "--include-content",
    "include full bookmark content in results",
    false,
  )
  .option("--all", "fetch all results (paginate through all pages)", false)
  .option("--cursor <cursor>", "cursor from a previous request for pagination")
  .action(async (query, opts) => {
    const api = getAPIClient();

    const request = {
      text: query,
      limit: opts.limit,
      sortOrder: opts.sortOrder as "relevance" | "asc" | "desc",
      includeContent: opts.includeContent,
      cursor: opts.cursor
        ? JSON.parse(Buffer.from(opts.cursor, "base64").toString(), (k, v) =>
            k === "createdAt" ? new Date(v) : v,
          )
        : undefined,
    };

    try {
      let resp = await api.bookmarks.searchBookmarks.query(request);
      let results: ZBookmark[] = resp.bookmarks;

      if (opts.all) {
        while (resp.nextCursor) {
          resp = await api.bookmarks.searchBookmarks.query({
            ...request,
            cursor: resp.nextCursor,
          });
          results = [...results, ...resp.bookmarks];
        }
      }

      const nextCursor =
        !opts.all && resp.nextCursor
          ? Buffer.from(JSON.stringify(resp.nextCursor)).toString("base64")
          : undefined;

      if (getGlobalOptions().json) {
        printObject(
          { bookmarks: results.map(normalizeBookmark), nextCursor },
          { maxArrayLength: null },
        );
      } else {
        results.forEach(printBookmarkCard);
        if (nextCursor) {
          console.log(`Next cursor: ${chalk.dim(nextCursor)}`);
        }
      }
    } catch (error) {
      printStatusMessage(false, "Failed to search bookmarks");
      if (error instanceof Error) {
        printStatusMessage(false, error.message);
      }
    }
  });

bookmarkCmd
  .command("delete")
  .description("delete a bookmark")
  .argument("<id>", "the id of the bookmark to delete")
  .action(async (id) => {
    const api = getAPIClient();
    await api.bookmarks.deleteBookmark
      .mutate({ bookmarkId: id })
      .then(printSuccess(`Bookmark with id '${id}' got deleted`))
      .catch(printError(`Failed to delete bookmark with id "${id}"`));
  });
