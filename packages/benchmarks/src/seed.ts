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
  userCount: number;
}

export interface SeededBookmark {
  id: string;
  tags: ZTagBasic[];
  listId?: string;
  title: string | null | undefined;
}

export interface UserSeedData {
  apiKey: string;
  trpc: TrpcClient;
  email: string;
  tags: ZTagBasic[];
  lists: ZBookmarkList[];
  bookmarks: SeededBookmark[];
}

export interface SeedResult {
  users: UserSeedData[];
  searchTerm: string;
  // For backwards compatibility, expose the first user's data
  apiKey: string;
  trpc: TrpcClient;
  tags: ZTagBasic[];
  lists: ZBookmarkList[];
  bookmarks: SeededBookmark[];
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

async function seedUserData(
  authlessClient: TrpcClient,
  userIndex: number,
  config: SeedConfig,
  timestamp: number,
): Promise<UserSeedData> {
  const email = `benchmarks+${timestamp}+user${userIndex}@example.com`;
  const password = "benchmarks1234";

  logStep(`Creating user ${userIndex + 1}/${config.userCount}`);
  await authlessClient.users.create.mutate({
    name: `Benchmark User ${userIndex + 1}`,
    email,
    password,
    confirmPassword: password,
  });
  const { key } = await authlessClient.apiKeys.exchange.mutate({
    email,
    password,
    keyName: `benchmark-key-${userIndex}`,
  });

  const trpc = getTrpcClient(key);
  logSuccess(`User ${userIndex + 1} ready`);

  logStep(`Creating ${config.tagCount} tags for user ${userIndex + 1}`);
  const tags: ZTagBasic[] = [];
  for (let i = 0; i < config.tagCount; i++) {
    const tag = await trpc.tags.create.mutate({
      name: `user${userIndex}-topic-${i + 1}`,
    });
    tags.push(tag);
  }
  logSuccess(`Tags created for user ${userIndex + 1}`);

  logStep(`Creating ${config.listCount} lists for user ${userIndex + 1}`);
  const lists: ZBookmarkList[] = [];
  for (let i = 0; i < config.listCount; i++) {
    const list = await trpc.lists.create.mutate({
      name: `User ${userIndex + 1} List ${i + 1}`,
      description: `Auto-generated benchmark list #${i + 1} for user ${userIndex + 1}`,
      icon: "bookmark",
    });
    lists.push(list);
  }
  logSuccess(`Lists created for user ${userIndex + 1}`);

  logStep(
    `Creating ${config.bookmarkCount} bookmarks for user ${userIndex + 1}`,
  );
  const limit = pLimit(config.concurrency);
  const bookmarks: SeededBookmark[] = [];

  await Promise.all(
    Array.from({ length: config.bookmarkCount }).map((_, index) =>
      limit(async () => {
        const topic = TOPICS[index % TOPICS.length];
        const createdAt = new Date(Date.now() - index * 3000);
        const bookmark = await trpc.bookmarks.createBookmark.mutate({
          type: BookmarkTypes.LINK,
          url: `https://example.com/user${userIndex}/${topic}/${index}`,
          title: `User ${userIndex + 1} ${topic} article ${index}`,
          source: "api",
          summary: `Benchmark dataset entry about ${topic} for user ${userIndex + 1}.`,
          favourited: index % 7 === 0,
          archived: index % 11 === 0,
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
  logSuccess(`Bookmarks created for user ${userIndex + 1}`);

  return {
    apiKey: key,
    trpc,
    email,
    tags,
    lists,
    bookmarks,
  };
}

export async function seedData(config: SeedConfig): Promise<SeedResult> {
  const authlessClient = getTrpcClient();
  const timestamp = Date.now();

  logInfo(`Seeding data for ${config.userCount} users`);
  const users: UserSeedData[] = [];

  // Create all users sequentially to avoid race conditions
  for (let i = 0; i < config.userCount; i++) {
    const userData = await seedUserData(authlessClient, i, config, timestamp);
    users.push(userData);
  }

  const searchTerm = "benchmark";
  logStep("Waiting for search index to be ready");
  // Use the first user's client to check search readiness
  await waitUntil(
    async () => {
      const results = await users[0].trpc.bookmarks.searchBookmarks.query({
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

  const totalBookmarks = users.reduce(
    (sum, user) => sum + user.bookmarks.length,
    0,
  );
  const totalTags = users.reduce((sum, user) => sum + user.tags.length, 0);
  const totalLists = users.reduce((sum, user) => sum + user.lists.length, 0);

  logInfo(
    `Seeded ${totalBookmarks} bookmarks across ${totalTags} tags and ${totalLists} lists for ${config.userCount} users`,
  );

  // Return first user's data for backwards compatibility
  const firstUser = users[0];
  return {
    users,
    searchTerm,
    apiKey: firstUser.apiKey,
    trpc: firstUser.trpc,
    tags: firstUser.tags,
    lists: firstUser.lists,
    bookmarks: firstUser.bookmarks,
  };
}
