import pLimit from "p-limit";

import type { ZBookmarkList } from "@karakeep/shared/types/lists";
import type { ZTagBasic } from "@karakeep/shared/types/tags";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { logInfo, logStep, logSuccess } from "./log";
import { getTrpcClient, TrpcClient } from "./trpc";
import { waitUntil } from "./utils";

export interface SeedConfig {
  bookmarkCount: number;
  tagCount: number;
  listCount: number;
  concurrency: number;
}

export interface SeededBookmark {
  id: string;
  tags: ZTagBasic[];
  listId?: string;
  title: string | null | undefined;
}

export interface SeedResult {
  apiKey: string;
  trpc: TrpcClient;
  tags: ZTagBasic[];
  lists: ZBookmarkList[];
  bookmarks: SeededBookmark[];
  searchTerm: string;
}

const TOPICS = [
  "performance",
  "search",
  "reading",
  "workflow",
  "api",
  "workers",
  "backend",
  "frontend",
  "productivity",
  "cli",
];

export async function seedData(config: SeedConfig): Promise<SeedResult> {
  const authlessClient = getTrpcClient();
  const email = `benchmarks+${Date.now()}@example.com`;
  const password = "benchmarks1234";

  logStep("Creating benchmark user and API key");
  await authlessClient.users.create.mutate({
    name: "Benchmark User",
    email,
    password,
    confirmPassword: password,
  });
  const { key } = await authlessClient.apiKeys.exchange.mutate({
    email,
    password,
    keyName: "benchmark-key",
  });

  const trpc = getTrpcClient(key);
  logSuccess("User ready");

  logStep(`Creating ${config.tagCount} tags`);
  const tags: ZTagBasic[] = [];
  for (let i = 0; i < config.tagCount; i++) {
    const tag = await trpc.tags.create.mutate({
      name: `topic-${i + 1}`,
    });
    tags.push(tag);
  }
  logSuccess("Tags created");

  logStep(`Creating ${config.listCount} lists`);
  const lists: ZBookmarkList[] = [];
  for (let i = 0; i < config.listCount; i++) {
    const list = await trpc.lists.create.mutate({
      name: `List ${i + 1}`,
      description: `Auto-generated benchmark list #${i + 1}`,
      icon: "bookmark",
    });
    lists.push(list);
  }
  logSuccess("Lists created");

  logStep(`Creating ${config.bookmarkCount} bookmarks`);
  const limit = pLimit(config.concurrency);
  const bookmarks: SeededBookmark[] = [];

  await Promise.all(
    Array.from({ length: config.bookmarkCount }).map((_, index) =>
      limit(async () => {
        const topic = TOPICS[index % TOPICS.length];
        const createdAt = new Date(Date.now() - index * 3000);
        const bookmark = await trpc.bookmarks.createBookmark.mutate({
          type: BookmarkTypes.LINK,
          url: `https://example.com/${topic}/${index}`,
          title: `Benchmark ${topic} article ${index}`,
          source: "api",
          summary: `Benchmark dataset entry about ${topic} performance and organization.`,
          favourited: index % 7 === 0,
          archived: false,
          createdAt,
        });

        const primaryTag = tags[index % tags.length];
        const secondaryTag = tags[(index + 5) % tags.length];
        const attachedTags = [primaryTag, secondaryTag];
        await trpc.bookmarks.updateTags.mutate({
          bookmarkId: bookmark.id,
          attach: attachedTags.map((tag) => ({
            tagId: tag.id,
            tagName: tag.name,
          })),
          detach: [],
        });

        let listId: string | undefined;
        if (lists.length > 0) {
          const list = lists[index % lists.length];
          await trpc.lists.addToList.mutate({
            listId: list.id,
            bookmarkId: bookmark.id,
          });
          listId = list.id;
        }

        bookmarks.push({
          id: bookmark.id,
          tags: attachedTags,
          listId,
          title: bookmark.title,
        });
      }),
    ),
  );
  logSuccess("Bookmarks created");

  const searchTerm = "benchmark";
  logStep("Waiting for search index to be ready");
  await waitUntil(
    async () => {
      const results = await trpc.bookmarks.searchBookmarks.query({
        text: searchTerm,
        limit: 1,
      });
      return results.bookmarks.length > 0;
    },
    "search data to be indexed",
    120_000,
    2_000,
  );
  logSuccess("Search index warmed up");

  logInfo(
    `Seeded ${bookmarks.length} bookmarks across ${tags.length} tags and ${lists.length} lists`,
  );

  return {
    apiKey: key,
    trpc,
    tags,
    lists,
    bookmarks,
    searchTerm,
  };
}
