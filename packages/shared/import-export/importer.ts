import { MAX_LIST_NAME_LENGTH } from "../types/lists";
import { ImportSource, ParsedImportFile, parseImportFile } from "./parsers";

export interface ImportCounts {
  successes: number;
  failures: number;
  alreadyExisted: number;
  total: number;
}

export interface StagedBookmark {
  type: "link" | "text" | "asset";
  url?: string;
  title?: string;
  content?: string;
  note?: string;
  tags: string[];
  listIds: string[];
  sourceAddedAt?: Date;
}

export interface ImportDeps {
  createList: (input: {
    name: string;
    icon: string;
    description?: string;
    parentId?: string;
    type?: "manual" | "smart";
    query?: string;
  }) => Promise<{ id: string }>;
  stageImportedBookmarks: (input: {
    importSessionId: string;
    bookmarks: StagedBookmark[];
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
    Record<ImportSource, (textContent: string) => ParsedImportFile>
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
  const parsedImport = parsers?.[source]
    ? parsers[source]!(textContent)
    : parseImportFile(source, textContent);
  const parsedBookmarks = parsedImport.bookmarks;
  const parsedLists = parsedImport.lists;
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

  const externalListIdToCreatedListId: Record<string, string> = {};
  if (parsedLists.length > 0) {
    const unresolvedLists = new Map(
      parsedLists.map((list) => [list.externalId, list]),
    );

    while (unresolvedLists.size > 0) {
      let createdAny = false;

      for (const [externalId, list] of unresolvedLists) {
        if (
          list.parentExternalId &&
          !externalListIdToCreatedListId[list.parentExternalId]
        ) {
          continue;
        }

        const parentId = list.parentExternalId
          ? externalListIdToCreatedListId[list.parentExternalId]
          : rootList.id;

        const createdList = await deps.createList({
          name: list.name.substring(0, MAX_LIST_NAME_LENGTH),
          parentId,
          icon: list.icon ?? "📁",
          description: list.description,
          ...(list.type === "smart" && list.query
            ? { type: "smart", query: list.query }
            : {}),
        });
        externalListIdToCreatedListId[externalId] = createdList.id;
        unresolvedLists.delete(externalId);
        createdAny = true;
      }

      // Break cycles or unresolved parent references by attaching remaining
      // lists to the import root.
      if (!createdAny) {
        for (const [externalId, list] of unresolvedLists) {
          const createdList = await deps.createList({
            name: list.name.substring(0, MAX_LIST_NAME_LENGTH),
            parentId: rootList.id,
            icon: list.icon ?? "📁",
            description: list.description,
            ...(list.type === "smart" && list.query
              ? { type: "smart", query: list.query }
              : {}),
          });
          externalListIdToCreatedListId[externalId] = createdList.id;
        }
        unresolvedLists.clear();
      }
    }
  }

  const PATH_DELIMITER = "$$__$$";
  const getPathKey = (parts: string[]) => parts.join(PATH_DELIMITER);
  const bookmarksWithPathMembership = parsedBookmarks.filter(
    (bookmark) =>
      !bookmark.listExternalIds || bookmark.listExternalIds.length === 0,
  );

  // Build required paths
  const allRequiredPaths = new Map<string, string>();
  for (const bookmark of bookmarksWithPathMembership) {
    for (const path of bookmark.paths) {
      if (path && path.length > 0) {
        for (let i = 1; i <= path.length; i++) {
          const subPath = path.slice(0, i);
          const pathKey = getPathKey(subPath);
          const folderName = subPath[subPath.length - 1];
          if (!allRequiredPaths.has(pathKey)) {
            allRequiredPaths.set(pathKey, folderName);
          }
        }
      }
    }
  }

  const allRequiredPathsArray = Array.from(allRequiredPaths.entries())
    .map(([pathKey, folderName]) => ({ pathKey, folderName }))
    .sort(
      (a, b) =>
        a.pathKey.split(PATH_DELIMITER).length -
        b.pathKey.split(PATH_DELIMITER).length,
    );

  const pathMap: Record<string, string> = { "": rootList.id };

  for (const { pathKey, folderName } of allRequiredPathsArray) {
    const parts = pathKey.split(PATH_DELIMITER);
    const parentKey = parts.slice(0, -1).join(PATH_DELIMITER);
    const parentId = pathMap[parentKey] || rootList.id;

    const folderList = await deps.createList({
      name: folderName.substring(0, MAX_LIST_NAME_LENGTH),
      parentId,
      icon: "📁",
    });
    pathMap[pathKey] = folderList.id;
  }

  // Prepare all bookmarks for staging
  const bookmarksToStage: StagedBookmark[] = parsedBookmarks.map((bookmark) => {
    // Convert paths to list IDs using pathMap
    // If no paths, assign to root list
    const listIdsFromPaths =
      bookmark.paths.length === 0
        ? [rootList.id]
        : bookmark.paths
            .map((path) => {
              if (path.length === 0) {
                return rootList.id;
              }
              const pathKey = getPathKey(path);
              return pathMap[pathKey] || rootList.id;
            })
            .filter((id, index, arr) => arr.indexOf(id) === index); // dedupe

    const externalListIds = bookmark.listExternalIds ?? [];
    const listIdsFromExternalListIds =
      externalListIds.length > 0
        ? [
            ...new Set(
              externalListIds.map((id) => externalListIdToCreatedListId[id]),
            ),
          ].filter((id): id is string => Boolean(id))
        : [];

    const listIds =
      listIdsFromExternalListIds.length > 0
        ? listIdsFromExternalListIds
        : listIdsFromPaths;

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

    return {
      type,
      url,
      title: bookmark.title,
      content: textContent,
      note: bookmark.notes,
      tags: bookmark.tags ?? [],
      listIds,
      sourceAddedAt: bookmark.addDate
        ? new Date(bookmark.addDate * 1000)
        : undefined,
    };
  });

  // Stage bookmarks in batches of 50
  const BATCH_SIZE = 50;
  let staged = 0;

  for (let i = 0; i < bookmarksToStage.length; i += BATCH_SIZE) {
    const batch = bookmarksToStage.slice(i, i + BATCH_SIZE);
    await deps.stageImportedBookmarks({
      importSessionId: session.id,
      bookmarks: batch,
    });
    staged += batch.length;
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
