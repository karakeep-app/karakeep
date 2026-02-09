// Copied from https://gist.github.com/devster31/4e8c6548fd16ffb75c02e6f24e27f9b9

import type { AnyNode } from "domhandler";
import * as cheerio from "cheerio";
import { parse } from "csv-parse/sync";
import { z } from "zod";

import { BookmarkTypes } from "../types/bookmarks";
import { zExportSchema } from "./exporters";

export type ImportSource =
  | "html"
  | "pocket"
  | "matter"
  | "omnivore"
  | "karakeep"
  | "linkwarden"
  | "tab-session-manager"
  | "mymind"
  | "instapaper";

export interface ParsedBookmark {
  title: string;
  content?:
    | { type: BookmarkTypes.LINK; url: string }
    | { type: BookmarkTypes.TEXT; text: string };
  tags: string[];
  addDate?: number;
  notes?: string;
  archived?: boolean;
  paths: string[][];
}

function parseNetscapeBookmarkFile(textContent: string): ParsedBookmark[] {
  if (!textContent.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1>")) {
    throw Error("The uploaded html file does not seem to be a bookmark file");
  }

  const $ = cheerio.load(textContent);
  const bookmarks: ParsedBookmark[] = [];

  // Recursively traverse the bookmark hierarchy top-down
  function traverseFolder(
    element: cheerio.Cheerio<AnyNode>,
    currentPath: string[],
  ) {
    element.children().each((_index, child) => {
      const $child = $(child);

      // Check if this is a folder (DT with H3)
      const h3 = $child.children("h3").first();
      if (h3.length > 0) {
        const folderName = h3.text().trim() || "Unnamed";
        const newPath = [...currentPath, folderName];

        // Find the DL that follows this folder and recurse into it
        const dl = $child.children("dl").first();
        if (dl.length > 0) {
          traverseFolder(dl, newPath);
        }
      } else {
        // Check if this is a bookmark (DT with A)
        const anchor = $child.children("a").first();
        if (anchor.length > 0) {
          const addDate = anchor.attr("add_date");
          const tagsStr = anchor.attr("tags");
          const tags = tagsStr && tagsStr.length > 0 ? tagsStr.split(",") : [];
          const url = anchor.attr("href");

          bookmarks.push({
            title: anchor.text(),
            content: url
              ? { type: BookmarkTypes.LINK as const, url }
              : undefined,
            tags,
            addDate:
              typeof addDate === "undefined" ? undefined : parseInt(addDate),
            paths: [currentPath],
          });
        }
      }
    });
  }

  // Start traversal from the root DL element
  const rootDl = $("dl").first();
  if (rootDl.length > 0) {
    traverseFolder(rootDl, []);
  }

  return bookmarks;
}

function parsePocketBookmarkFile(textContent: string): ParsedBookmark[] {
  const records = parse(textContent, {
    columns: true,
    skip_empty_lines: true,
  }) as {
    title: string;
    url: string;
    time_added: string;
    tags: string;
    status?: string;
  }[];

  return records.map((record) => {
    return {
      title: record.title,
      content: { type: BookmarkTypes.LINK as const, url: record.url },
      tags: record.tags.length > 0 ? record.tags.split("|") : [],
      addDate: parseInt(record.time_added),
      archived: record.status === "archive",
      paths: [], // TODO
    };
  });
}

function parseMatterBookmarkFile(textContent: string): ParsedBookmark[] {
  const zMatterRecordSchema = z.object({
    Title: z.string(),
    Author: z.string(),
    Publisher: z.string(),
    URL: z.string(),
    Tags: z
      .string()
      .transform((tags) => (tags.length > 0 ? tags.split(";") : [])),
    "Word Count": z.string(),
    "In Queue": z.string().transform((inQueue) => inQueue === "False"),
    Favorited: z.string(),
    Read: z.string(),
    Highlight_Count: z.string(),
    "Last Interaction Date": z
      .string()
      .transform((date) => Date.parse(date) / 1000),
    "File Id": z.string(),
  });

  const zMatterExportSchema = z.array(zMatterRecordSchema);

  const records = parse(textContent, {
    columns: true,
    skip_empty_lines: true,
  });

  const parsed = zMatterExportSchema.safeParse(records);
  if (!parsed.success) {
    throw new Error(
      `The uploaded CSV file contains an invalid Matter bookmark file: ${parsed.error.toString()}`,
    );
  }

  return parsed.data.map((record) => {
    return {
      title: record.Title,
      content: { type: BookmarkTypes.LINK as const, url: record.URL },
      tags: record.Tags,
      addDate: record["Last Interaction Date"],
      archived: record["In Queue"],
      paths: [], // TODO
    };
  });
}

function parseKarakeepBookmarkFile(textContent: string): ParsedBookmark[] {
  const parsed = zExportSchema.safeParse(JSON.parse(textContent));
  if (!parsed.success) {
    throw new Error(
      `The uploaded JSON file contains an invalid bookmark file: ${parsed.error.toString()}`,
    );
  }

  return parsed.data.bookmarks.map((bookmark) => {
    let content = undefined;
    if (bookmark.content?.type == BookmarkTypes.LINK) {
      content = {
        type: BookmarkTypes.LINK as const,
        url: bookmark.content.url,
      };
    } else if (bookmark.content?.type == BookmarkTypes.TEXT) {
      content = {
        type: BookmarkTypes.TEXT as const,
        text: bookmark.content.text,
      };
    }
    return {
      title: bookmark.title ?? "",
      content,
      tags: bookmark.tags,
      addDate: bookmark.createdAt,
      notes: bookmark.note ?? undefined,
      archived: bookmark.archived,
      paths: [], // TODO
    };
  });
}

function parseOmnivoreBookmarkFile(textContent: string): ParsedBookmark[] {
  const zOmnivoreExportSchema = z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      labels: z.array(z.string()),
      savedAt: z.coerce.date(),
      state: z.string().optional(),
    }),
  );

  const parsed = zOmnivoreExportSchema.safeParse(JSON.parse(textContent));
  if (!parsed.success) {
    throw new Error(
      `The uploaded JSON file contains an invalid omnivore bookmark file: ${parsed.error.toString()}`,
    );
  }

  return parsed.data.map((bookmark) => {
    return {
      title: bookmark.title ?? "",
      content: { type: BookmarkTypes.LINK as const, url: bookmark.url },
      tags: bookmark.labels,
      addDate: bookmark.savedAt.getTime() / 1000,
      archived: bookmark.state === "Archived",
      paths: [],
    };
  });
}

function parseLinkwardenBookmarkFile(textContent: string): ParsedBookmark[] {
  const zLinkwardenExportSchema = z.object({
    collections: z.array(
      z.object({
        links: z.array(
          z.object({
            name: z.string(),
            url: z.string(),
            tags: z.array(z.object({ name: z.string() })),
            createdAt: z.coerce.date(),
          }),
        ),
      }),
    ),
  });

  const parsed = zLinkwardenExportSchema.safeParse(JSON.parse(textContent));
  if (!parsed.success) {
    throw new Error(
      `The uploaded JSON file contains an invalid Linkwarden bookmark file: ${parsed.error.toString()}`,
    );
  }

  return parsed.data.collections.flatMap((collection) => {
    return collection.links.map((bookmark) => ({
      title: bookmark.name ?? "",
      content: { type: BookmarkTypes.LINK as const, url: bookmark.url },
      tags: bookmark.tags.map((tag) => tag.name),
      addDate: bookmark.createdAt.getTime() / 1000,
      paths: [], // TODO
    }));
  });
}

function parseTabSessionManagerStateFile(
  textContent: string,
): ParsedBookmark[] {
  const zTab = z.object({
    url: z.string(),
    title: z.string(),
    lastAccessed: z.number(),
  });

  const zSession = z.object({
    windows: z.record(z.string(), z.record(z.string(), zTab)),
    date: z.number(),
  });

  const zTabSessionManagerSchema = z.array(zSession);

  const parsed = zTabSessionManagerSchema.safeParse(JSON.parse(textContent));
  if (!parsed.success) {
    throw new Error(
      `The uploaded JSON file contains an invalid Tab Session Manager bookmark file: ${parsed.error.toString()}`,
    );
  }

  // Get the object in data that has the most recent `date`
  const { windows } = parsed.data.reduce((prev, curr) =>
    prev.date > curr.date ? prev : curr,
  );

  return Object.values(windows).flatMap((window) =>
    Object.values(window).map((tab) => ({
      title: tab.title,
      content: { type: BookmarkTypes.LINK as const, url: tab.url },
      tags: [],
      addDate: tab.lastAccessed,
      paths: [], // Tab Session Manager doesn't have folders
    })),
  );
}

function parseMymindBookmarkFile(textContent: string): ParsedBookmark[] {
  const zMymindRecordSchema = z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    url: z.string(),
    content: z.string(),
    note: z.string(),
    tags: z.string(),
    created: z.string(),
  });

  const zMymindExportSchema = z.array(zMymindRecordSchema);

  const records = parse(textContent, {
    columns: true,
    skip_empty_lines: true,
  });

  const parsed = zMymindExportSchema.safeParse(records);
  if (!parsed.success) {
    throw new Error(
      `The uploaded CSV file contains an invalid mymind bookmark file: ${parsed.error.toString()}`,
    );
  }

  return parsed.data.map((record) => {
    // Determine content type based on presence of URL and content fields
    let content: ParsedBookmark["content"];
    if (record.url && record.url.trim().length > 0) {
      content = { type: BookmarkTypes.LINK as const, url: record.url.trim() };
    } else if (record.content && record.content.trim().length > 0) {
      content = {
        type: BookmarkTypes.TEXT as const,
        text: record.content.trim(),
      };
    }

    // Parse tags from comma-separated string
    const tags =
      record.tags && record.tags.trim().length > 0
        ? record.tags.split(",").map((tag) => tag.trim())
        : [];

    // Parse created date to timestamp (in seconds)
    const addDate = record.created
      ? new Date(record.created).getTime() / 1000
      : undefined;

    return {
      title: record.title || "",
      content,
      tags,
      addDate,
      notes:
        record.note && record.note.trim().length > 0 ? record.note : undefined,
      paths: [], // mymind doesn't have folder structure
    };
  });
}

function parseInstapaperBookmarkFile(textContent: string): ParsedBookmark[] {
  const zInstapaperRecordScheme = z.object({
    URL: z.string(),
    Title: z.string(),
    Selection: z.string(),
    Folder: z.string(),
    Timestamp: z.string(),
    Tags: z.string(),
  });

  const zInstapaperExportScheme = z.array(zInstapaperRecordScheme);

  const record = parse(textContent, {
    columns: true,
    skip_empty_lines: true,
  });

  const parsed = zInstapaperExportScheme.safeParse(record);

  if (!parsed.success) {
    throw new Error(
      `CSV file contains an invalid instapaper bookmark file: ${parsed.error.toString()}`,
    );
  }

  return parsed.data.map((record) => {
    let content: ParsedBookmark["content"];
    if (record.URL && record.URL.trim().length > 0) {
      content = { type: BookmarkTypes.LINK as const, url: record.URL.trim() };
    } else if (record.Selection && record.Selection.trim().length > 0) {
      content = {
        type: BookmarkTypes.TEXT as const,
        text: record.Selection.trim(),
      };
    }

    const addDate = parseInt(record.Timestamp);

    let tags: string[] = [];
    try {
      const parsedTags = JSON.parse(record.Tags);
      if (Array.isArray(parsedTags)) {
        tags = parsedTags.map((tag) => tag.toString().trim());
      }
    } catch {
      tags = [];
    }

    return {
      title: record.Title || "",
      content,
      addDate,
      tags,
      paths: [], // TODO
    };
  });
}

function deduplicateBookmarks(bookmarks: ParsedBookmark[]): ParsedBookmark[] {
  const deduplicatedBookmarksMap = new Map<string, ParsedBookmark>();
  const textBookmarks: ParsedBookmark[] = [];

  for (const bookmark of bookmarks) {
    if (bookmark.content?.type === BookmarkTypes.LINK) {
      const url = bookmark.content.url;
      if (deduplicatedBookmarksMap.has(url)) {
        const existing = deduplicatedBookmarksMap.get(url)!;
        // Merge tags
        existing.tags = [...new Set([...existing.tags, ...bookmark.tags])];
        // Merge paths
        existing.paths = [...existing.paths, ...bookmark.paths];
        const existingDate = existing.addDate ?? Infinity;
        const newDate = bookmark.addDate ?? Infinity;
        if (newDate < existingDate) {
          existing.addDate = bookmark.addDate;
        }
        // Append notes if both exist
        if (existing.notes && bookmark.notes) {
          existing.notes = `${existing.notes}\n---\n${bookmark.notes}`;
        } else if (bookmark.notes) {
          existing.notes = bookmark.notes;
        }
        // For archived status, prefer archived if either is archived
        if (bookmark.archived === true) {
          existing.archived = true;
        }
        // Title: keep existing one for simplicity
      } else {
        deduplicatedBookmarksMap.set(url, bookmark);
      }
    } else {
      // Keep text bookmarks as they are (no URL to dedupe on)
      textBookmarks.push(bookmark);
    }
  }

  return [...deduplicatedBookmarksMap.values(), ...textBookmarks];
}

export function parseImportFile(
  source: ImportSource,
  textContent: string,
): ParsedBookmark[] {
  let result: ParsedBookmark[];
  switch (source) {
    case "html":
      result = parseNetscapeBookmarkFile(textContent);
      break;
    case "pocket":
      result = parsePocketBookmarkFile(textContent);
      break;
    case "matter":
      result = parseMatterBookmarkFile(textContent);
      break;
    case "karakeep":
      result = parseKarakeepBookmarkFile(textContent);
      break;
    case "omnivore":
      result = parseOmnivoreBookmarkFile(textContent);
      break;
    case "linkwarden":
      result = parseLinkwardenBookmarkFile(textContent);
      break;
    case "tab-session-manager":
      result = parseTabSessionManagerStateFile(textContent);
      break;
    case "mymind":
      result = parseMymindBookmarkFile(textContent);
      break;
    case "instapaper":
      result = parseInstapaperBookmarkFile(textContent);
      break;
  }
  return deduplicateBookmarks(result);
}
