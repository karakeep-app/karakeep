// Copied from https://gist.github.com/devster31/4e8c6548fd16ffb75c02e6f24e27f9b9
import * as cheerio from "cheerio";
import { parse } from "csv-parse/sync";
import { z } from "zod";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { zExportSchema } from "./exportBookmarks";

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

export async function parseNetscapeBookmarkFile(
  file: File,
): Promise<ParsedBookmark[]> {
  const textContent = await file.text();

  if (!textContent.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1>")) {
    throw Error("The uploaded html file does not seem to be a bookmark file");
  }

  const $ = cheerio.load(textContent);

  return $("a")
    .map(function (_index, a) {
      const $a = $(a);
      const addDate = $a.attr("add_date");
      let tags: string[] = [];

      const tagsStr = $a.attr("tags");
      try {
        tags = tagsStr && tagsStr.length > 0 ? tagsStr.split(",") : [];
      } catch {
        /* empty */
      }
      const url = $a.attr("href");

      // Build folder path by traversing up the hierarchy
      const path: string[] = [];
      let current = $a.parent();
      while (current && current.length > 0) {
        const h3 = current.find("> h3").first();
        if (h3.length > 0) {
          path.unshift(h3.text());
        }
        current = current.parent();
      }

      return {
        title: $a.text(),
        content: url ? { type: BookmarkTypes.LINK as const, url } : undefined,
        tags,
        addDate: typeof addDate === "undefined" ? undefined : parseInt(addDate),
        paths: [path],
      };
    })
    .get();
}

export async function parsePocketBookmarkFile(
  file: File,
): Promise<ParsedBookmark[]> {
  const textContent = await file.text();

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

export async function parseKarakeepBookmarkFile(
  file: File,
): Promise<ParsedBookmark[]> {
  const textContent = await file.text();

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

export async function parseOmnivoreBookmarkFile(
  file: File,
): Promise<ParsedBookmark[]> {
  const textContent = await file.text();
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

export async function parseLinkwardenBookmarkFile(
  file: File,
): Promise<ParsedBookmark[]> {
  const textContent = await file.text();
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

export async function parseTabSessionManagerStateFile(
  file: File,
): Promise<ParsedBookmark[]> {
  const textContent = await file.text();

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

export async function parseOneTabBookmarkFile(
  file: File,
): Promise<ParsedBookmark[]> {
  const textContent = await file.text();

  // Try to parse as JSON first (OneTab advanced export format)
  try {
    const zOneTabJsonSchema = z.array(
      z.object({
        groupTitle: z.string().optional(),
        created: z.number().optional(),
        tabLinks: z.array(
          z.object({
            link: z.string().url(),
            title: z.string(),
          }),
        ),
        isLocked: z.boolean().optional(),
        isStarred: z.boolean().optional(),
      }),
    );

    const parsed = zOneTabJsonSchema.safeParse(JSON.parse(textContent));
    if (parsed.success) {
      const bookmarks: ParsedBookmark[] = [];

      for (const group of parsed.data) {
        const groupPath = group.groupTitle ? [group.groupTitle] : [];

        for (const tab of group.tabLinks) {
          bookmarks.push({
            title: tab.title || new URL(tab.link).hostname,
            content: { type: BookmarkTypes.LINK as const, url: tab.link },
            tags: group.isStarred ? ["starred"] : [],
            addDate: group.created ? group.created / 1000 : undefined, // Convert from ms to seconds
            archived: false,
            paths: groupPath.length > 0 ? [groupPath] : [],
          });
        }
      }

      return bookmarks;
    }
  } catch {
    // Not JSON format, continue to text format parsing
  }

  // Parse as simple text format (URL | Title per line)
  const lines = textContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#")); // Skip comments and empty lines

  const bookmarks: ParsedBookmark[] = [];

  for (const line of lines) {
    if (line.includes(" | ")) {
      const [url, title] = line.split(" | ", 2);

      // Validate URL
      try {
        new URL(url.trim());
        bookmarks.push({
          title: title.trim() || new URL(url.trim()).hostname,
          content: { type: BookmarkTypes.LINK as const, url: url.trim() },
          tags: [],
          paths: [],
        });
      } catch {
        // Skip invalid URLs
        continue;
      }
    } else {
      // Try to parse as URL only
      const url = line.trim();
      try {
        new URL(url);
        bookmarks.push({
          title: new URL(url).hostname,
          content: { type: BookmarkTypes.LINK as const, url },
          tags: [],
          paths: [],
        });
      } catch {
        // Skip invalid URLs
        continue;
      }
    }
  }

  if (bookmarks.length === 0) {
    throw new Error(
      "No valid bookmarks found in the OneTab file. Please ensure the file contains URLs in the format 'URL | Title' or valid OneTab JSON export.",
    );
  }

  return bookmarks;
}

export function deduplicateBookmarks(
  bookmarks: ParsedBookmark[],
): ParsedBookmark[] {
  const deduplicatedBookmarksMap = new Map<string, ParsedBookmark>();
  const textBookmarks: ParsedBookmark[] = [];

  for (const bookmark of bookmarks) {
    if (bookmark.content?.type === BookmarkTypes.LINK) {
      const url = bookmark.content.url;
      if (deduplicatedBookmarksMap.has(url)) {
        const existing = deduplicatedBookmarksMap.get(url)!;
        // Merge tags
        existing.tags = Array.from(
          new Set([...existing.tags, ...bookmark.tags]),
        );
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

  return Array.from(deduplicatedBookmarksMap.values()).concat(textBookmarks);
}
