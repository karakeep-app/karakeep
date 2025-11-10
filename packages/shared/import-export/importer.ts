import type { ZBookmarkList } from "../types/lists";
import { limitConcurrency } from "../concurrency";
import { MAX_LIST_NAME_LENGTH } from "../types/lists";
import { ImportSource, ParsedBookmark, parseImportFile } from "./parsers";

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
    parentId?: string;
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
  getExistingLists?: () => Promise<
    Pick<ZBookmarkList, "id" | "name" | "parentId" | "icon" | "type">[]
  >;
}

export interface ImportOptions {
  concurrencyLimit?: number;
  parsers?: Partial<
    Record<ImportSource, (textContent: string) => ParsedBookmark[]>
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
  const parsedBookmarks = parsers?.[source]
    ? parsers[source]!(textContent)
    : parseImportFile(source, textContent);
  if (parsedBookmarks.length === 0) {
    return {
      counts: { successes: 0, failures: 0, alreadyExisted: 0, total: 0 },
      rootListId: null,
      importSessionId: null,
    };
  }

  const PATH_DELIMITER = "$$__$$";

  const existingLists =
    (await deps.getExistingLists?.()) ??
    ([] as Pick<ZBookmarkList, "id" | "name" | "parentId" | "icon" | "type">[]);
  const manualExistingLists = existingLists.filter((l) => l.type === "manual");

  const rootCandidates = manualExistingLists.filter(
    (l) => !l.parentId && l.name === rootListName && l.icon === "⬆️",
  );

  let rootListId: string;
  let usedExistingRoot = false;

  if (rootCandidates.length === 1) {
    rootListId = rootCandidates[0].id;
    usedExistingRoot = true;
  } else {
    const rootList = await deps.createList({
      name: rootListName,
      icon: "⬆️",
    });
    rootListId = rootList.id;
  }
  const pathMap: Record<string, string> = { "": rootListId };

  if (usedExistingRoot) {
    const root = rootCandidates[0];
    const childrenByParent = manualExistingLists.reduce<
      Map<
        string,
        Pick<ZBookmarkList, "id" | "name" | "parentId" | "icon" | "type">[]
      >
    >((acc, list) => {
      if (!list.parentId) {
        return acc;
      }
      const current = acc.get(list.parentId) ?? [];
      current.push(list);
      acc.set(list.parentId, current);
      return acc;
    }, new Map());

    const stack = (childrenByParent.get(root.id) ?? []).map((child) => ({
      list: child,
      path: [child.name],
    }));

    while (stack.length > 0) {
      const { list, path } = stack.pop()!;
      const key = path.join(PATH_DELIMITER);
      pathMap[key] = list.id;

      const children = childrenByParent.get(list.id) ?? [];
      children.forEach((child) =>
        stack.push({
          list: child,
          path: [...path, child.name],
        }),
      );
    }
  }

  const session = await deps.createImportSession({
    name: `${source.charAt(0).toUpperCase() + source.slice(1)} Import - ${new Date().toLocaleDateString()}`,
    rootListId,
  });

  onProgress?.(0, parsedBookmarks.length);

  // Build required paths
  const allRequiredPaths = new Set<string>();
  for (const bookmark of parsedBookmarks) {
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

  for (const pathKey of allRequiredPathsArray) {
    if (pathMap[pathKey]) continue;
    const parts = pathKey.split(PATH_DELIMITER);
    const parentKey = parts.slice(0, -1).join(PATH_DELIMITER);
    const parentId = pathMap[parentKey] || rootListId;

    const folderName = parts[parts.length - 1];
    const folderList = await deps.createList({
      name: folderName.substring(0, MAX_LIST_NAME_LENGTH),
      parentId,
      icon: "📁",
    });
    pathMap[pathKey] = folderList.id;
  }

  let done = 0;
  const importPromises = parsedBookmarks.map((bookmark) => async () => {
    try {
      const listIds = bookmark.paths.map(
        (path) => pathMap[path.join(PATH_DELIMITER)] || rootListId,
      );
      if (listIds.length === 0) listIds.push(rootListId);

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
      onProgress?.(done, parsedBookmarks.length);
    }
  });

  const resultsPromises = limitConcurrency(importPromises, concurrencyLimit);
  const results = await Promise.allSettled(resultsPromises);

  let successes = 0;
  let failures = 0;
  let alreadyExisted = 0;

  for (const r of results) {
    if (r.status === "fulfilled") {
      if (r.value.alreadyExists) alreadyExisted++;
      else successes++;
    } else {
      failures++;
    }
  }
  return {
    counts: {
      successes,
      failures,
      alreadyExisted,
      total: parsedBookmarks.length,
    },
    rootListId,
    importSessionId: session.id,
  };
}
