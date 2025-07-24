import type { Index } from "meilisearch";
import { MeiliSearch } from "meilisearch";
import { z } from "zod";

import serverConfig from "./config";

export const zBookmarkIdxSchema = z.object({
  id: z.string(),
  userId: z.string(),
  url: z.string().nullish(),
  title: z.string().nullish(),
  linkTitle: z.string().nullish(),
  description: z.string().nullish(),
  content: z.string().nullish(),
  metadata: z.string().nullish(),
  fileName: z.string().nullish(),
  createdAt: z.string().nullish(),
  note: z.string().nullish(),
  summary: z.string().nullish(),
  tags: z.array(z.string()).default([]),
  publisher: z.string().nullish(),
  author: z.string().nullish(),
  datePublished: z.date().nullish(),
  dateModified: z.date().nullish(),
});

export type ZBookmarkIdx = z.infer<typeof zBookmarkIdxSchema>;

let searchClient: MeiliSearch | undefined;

if (serverConfig.search.meilisearch) {
  searchClient = new MeiliSearch({
    host: serverConfig.search.meilisearch.address,
    apiKey: serverConfig.search.meilisearch.key,
  });
}

const BOOKMARKS_IDX_NAME = "bookmarks";

let idxClient: Index<ZBookmarkIdx> | undefined;

export async function getSearchIdxClient(): Promise<Index<ZBookmarkIdx> | null> {
  if (idxClient) {
    return idxClient;
  }
  if (!searchClient) {
    return null;
  }

  const indicies = await searchClient.getIndexes();
  let idxFound = indicies.results.find((i) => i.uid == BOOKMARKS_IDX_NAME);
  if (!idxFound) {
    const idx = await searchClient.createIndex(BOOKMARKS_IDX_NAME, {
      primaryKey: "id",
    });
    await searchClient.waitForTask(idx.taskUid);
    idxFound = await searchClient.getIndex<ZBookmarkIdx>(BOOKMARKS_IDX_NAME);
  }

  const desiredFilterableAttributes = ["id", "userId"].sort();
  const desiredSortableAttributes = ["createdAt"].sort();

  const settings = await idxFound.getSettings();
  if (
    JSON.stringify(settings.filterableAttributes?.sort()) !=
    JSON.stringify(desiredFilterableAttributes)
  ) {
    console.log(
      `[meilisearch] Updating desired filterable attributes to ${desiredFilterableAttributes} from ${settings.filterableAttributes}`,
    );
    const taskId = await idxFound.updateFilterableAttributes(
      desiredFilterableAttributes,
    );
    await searchClient.waitForTask(taskId.taskUid);
  }

  if (
    JSON.stringify(settings.sortableAttributes?.sort()) !=
    JSON.stringify(desiredSortableAttributes)
  ) {
    console.log(
      `[meilisearch] Updating desired sortable attributes to ${desiredSortableAttributes} from ${settings.sortableAttributes}`,
    );
    const taskId = await idxFound.updateSortableAttributes(
      desiredSortableAttributes,
    );
    await searchClient.waitForTask(taskId.taskUid);
  }
  idxClient = idxFound;
  return idxFound;
}
