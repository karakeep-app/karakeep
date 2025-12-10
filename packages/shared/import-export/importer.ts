import { limitConcurrency } from "../concurrency";
import { MAX_LIST_NAME_LENGTH } from "../types/lists";
import {
  ImportSource,
  ParsedBookmark,
  ParsedList,
  parseImportFile,
} from "./parsers";

export interface ImportCounts {
  successes: number;
  failures: number;
  alreadyExisted: number;
  total: number;
}

export interface ImportDeps {
  createList: (input: {
    name: string;
    icon: string;
    parentId?: string | null;
    description?: string | null;
    type?: "manual" | "smart";
    query?: string | null;
  }) => Promise<{ id: string }>;
  createBookmark: (
    bookmark: ParsedBookmark,
    sessionId: string,
  ) => Promise<{ id: string; alreadyExists?: boolean }>;
  addBookmarkToLists: (input: {
    bookmarkId: string;
    listIds: string[];
  }) => Promise<void>;
  updateBookmarkTags: (input: {
    bookmarkId: string;
    tags: string[];
  }) => Promise<void>;
  createImportSession: (input: {
    name: string;
    rootListId: string;
  }) => Promise<{ id: string }>;
}

export interface ImportOptions {
  concurrencyLimit?: number;
  parsers?: Partial<
    Record<
      ImportSource,
      (textContent: string) => { bookmarks: ParsedBookmark[]; lists?: ParsedList[] }
    >
  >;
}

export interface ImportResult {
  counts: ImportCounts;
  rootListId: string | null;
  importSessionId: string | null;
}

export async function importBookmarksFromFile(
  {
    file,
    source,
    rootListName,
    deps,
    onProgress,
  }: {
    file: { text: () => Promise<string> };
    source: ImportSource;
    rootListName: string;
    deps: ImportDeps;
    onProgress?: (done: number, total: number) => void;
  },
  options: ImportOptions = {},
): Promise<ImportResult> {
  const { concurrencyLimit = 20, parsers } = options;

  const textContent = await file.text();
  const parsed = parsers?.[source]
    ? parsers[source]!(textContent)
    : parseImportFile(source, textContent);

  if (parsed.bookmarks.length === 0) {
    return {
      counts: { successes: 0, failures: 0, alreadyExisted: 0, total: 0 },
      rootListId: null,
      importSessionId: null,
    };
  }

  const rootList = await deps.createList({ name: rootListName, icon: "⬆️" });
  const session = await deps.createImportSession({
    name: `${source.charAt(0).toUpperCase() + source.slice(1)} Import - ${new Date().toLocaleDateString()}`,
    rootListId: rootList.id,
  });

  onProgress?.(0, parsed.bookmarks.length);

  const PATH_DELIMITER = "$$__$$";

  // Map from old list IDs to new list IDs
  const listIdMap = new Map<string, string>();

  // If we have lists in the import, create them respecting hierarchy
  if (parsed.lists && parsed.lists.length > 0) {
    // Sort lists by hierarchy depth (parents before children)
    const sortedLists = [...parsed.lists].sort((a, b) => {
      // Count hierarchy depth
      const depthA = countParentDepth(a, parsed.lists!);
      const depthB = countParentDepth(b, parsed.lists!);
      return depthA - depthB;
    });

    // Create all imported lists
    for (const list of sortedLists) {
      // Map parent ID if it exists
      const newParentId = list.parentId
        ? listIdMap.get(list.parentId) ?? rootList.id
        : rootList.id;

      const newList = await deps.createList({
        name: list.name.substring(0, MAX_LIST_NAME_LENGTH),
        icon: list.icon,
        parentId: newParentId,
        description: list.description,
        type: list.type,
        query: list.query,
      });

      listIdMap.set(list.id, newList.id);
    }
  }

  // Build required paths (for backward compatibility with imports that use paths)
  const allRequiredPaths = new Set<string>();
  for (const bookmark of parsed.bookmarks) {
    for (const path of bookmark.paths) {
      if (path && path.length > 0) {
        for (let i = 1; i <= path.length; i++) {
          const subPath = path.slice(0, i);
          const pathKey = subPath.join(PATH_DELIMITER);
          allRequiredPaths.add(pathKey);
        }
      }
    }
  }

  const allRequiredPathsArray = Array.from(allRequiredPaths).sort(
    (a, b) => a.split(PATH_DELIMITER).length - b.split(PATH_DELIMITER).length,
  );

  const pathMap: Record<string, string> = { "": rootList.id };

  for (const pathKey of allRequiredPathsArray) {
    const parts = pathKey.split(PATH_DELIMITER);
    const parentKey = parts.slice(0, -1).join(PATH_DELIMITER);
    const parentId = pathMap[parentKey] || rootList.id;

    const folderName = parts[parts.length - 1];
    const folderList = await deps.createList({
      name: folderName.substring(0, MAX_LIST_NAME_LENGTH),
      parentId,
      icon: "📁",
    });
    pathMap[pathKey] = folderList.id;
  }

  let done = 0;
  const importPromises = parsed.bookmarks.map(
    (bookmark: ParsedBookmark) => async () => {
      try {
        // Prefer listIds over paths if available
        let listIds: string[] = [];
        if (bookmark.listIds && bookmark.listIds.length > 0) {
          // Map old list IDs to new list IDs
          listIds = bookmark.listIds
            .map((id: string) => listIdMap.get(id))
            .filter((id): id is string => id !== undefined);
        } else {
          // Fall back to path-based lists
          listIds = bookmark.paths.map(
            (path: string[]) =>
              pathMap[path.join(PATH_DELIMITER)] || rootList.id,
          );
        }

        // If no lists, add to root list
        if (listIds.length === 0) listIds.push(rootList.id);

        const created = await deps.createBookmark(bookmark, session.id);
        await deps.addBookmarkToLists({ bookmarkId: created.id, listIds });
        if (bookmark.tags && bookmark.tags.length > 0) {
          await deps.updateBookmarkTags({
            bookmarkId: created.id,
            tags: bookmark.tags,
          });
        }

        return created;
      } finally {
        done += 1;
        onProgress?.(done, parsed.bookmarks.length);
      }
    },
  );

  const resultsPromises = limitConcurrency(importPromises, concurrencyLimit);
  const results = await Promise.allSettled(resultsPromises);

  let successes = 0;
  let failures = 0;
  let alreadyExisted = 0;

  for (const r of results) {
    if (r.status === "fulfilled") {
      if (
        (r.value as { id: string; alreadyExists?: boolean }).alreadyExists
      ) {
        alreadyExisted++;
      } else {
        successes++;
      }
    } else {
      failures++;
    }
  }
  return {
    counts: {
      successes,
      failures,
      alreadyExisted,
      total: parsed.bookmarks.length,
    },
    rootListId: rootList.id,
    importSessionId: session.id,
  };
}

// Helper function to count parent depth in hierarchy
function countParentDepth(list: ParsedList, allLists: ParsedList[]): number {
  let depth = 0;
  let currentId = list.parentId;

  while (currentId) {
    depth++;
    const parent = allLists.find((l) => l.id === currentId);
    if (!parent) break;
    currentId = parent.parentId;
  }

  return depth;
}
