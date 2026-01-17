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
  stageImportedBookmark: (input: {
    importSessionId: string;
    type: "link" | "text" | "asset";
    url?: string;
    title?: string;
    content?: string;
    note?: string;
    tags: string[];
    listPaths: string[];
    sourceAddedAt?: Date;
  }) => Promise<void>;
  createImportSession: (input: {
    name: string;
    rootListId: string;
  }) => Promise<{ id: string }>;
  finalizeImportStaging: (sessionId: string) => Promise<void>;
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
  const { parsers } = options;

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

  const rootList = await deps.createList({ name: rootListName, icon: "⬆️" });
  const session = await deps.createImportSession({
    name: `${source.charAt(0).toUpperCase() + source.slice(1)} Import - ${new Date().toLocaleDateString()}`,
    rootListId: rootList.id,
  });

  onProgress?.(0, parsedBookmarks.length);

  const PATH_DELIMITER = "$$__$$";

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

  // Stage all bookmarks (no side effects, just DB inserts)
  let staged = 0;
  for (const bookmark of parsedBookmarks) {
    const listPaths = bookmark.paths.map((path) => path.join("/"));

    // Determine type and extract content appropriately
    let type: "link" | "text" | "asset" = "link";
    let url: string | undefined;
    let textContent: string | undefined;

    if (bookmark.content) {
      if (bookmark.content.type === "link") {
        type = "link";
        url = bookmark.content.url;
      } else if (bookmark.content.type === "text") {
        type = "text";
        textContent = bookmark.content.text;
      }
    }

    await deps.stageImportedBookmark({
      importSessionId: session.id,
      type,
      url,
      title: bookmark.title,
      content: textContent,
      note: bookmark.notes,
      tags: bookmark.tags ?? [],
      listPaths,
      sourceAddedAt: bookmark.addDate
        ? new Date(bookmark.addDate * 1000)
        : undefined,
    });

    staged++;
    onProgress?.(staged, parsedBookmarks.length);
  }

  // Finalize staging - marks session as "pending" for worker pickup
  await deps.finalizeImportStaging(session.id);

  return {
    counts: {
      successes: 0,
      failures: 0,
      alreadyExisted: 0,
      total: parsedBookmarks.length,
    },
    rootListId: rootList.id,
    importSessionId: session.id,
  };
}
