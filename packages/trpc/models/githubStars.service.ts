import { and, eq, isNull, lt, lte, or } from "drizzle-orm";
import type { DB } from "@karakeep/db";
import { githubStarsSubscriptions } from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import type { appRouter } from "../routers/_app";

type Client = ReturnType<typeof appRouter.createCaller>;
export interface StarredPage {
  repositories: { full_name: string; topics: string[] }[];
  hasNext: boolean;
}
export class GithubStarsError extends Error {
  constructor(
    message: string,
    readonly retryAt: Date,
    readonly rateLimited = false,
  ) {
    super(message);
  }
}

// One bounded page per job: interrupted imports safely retry the same page.
export async function syncGithubStarsPage(
  db: DB,
  id: string,
  readPage: (username: string, page: number) => Promise<StarredPage>,
  getClient: (userId: string) => Promise<Client>,
) {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + 10 * 60_000);
  const subscription = db
    .update(githubStarsSubscriptions)
    .set({ leaseUntil })
    .where(
      and(
        eq(githubStarsSubscriptions.id, id),
        eq(githubStarsSubscriptions.enabled, true),
        lte(githubStarsSubscriptions.nextRunAt, now),
        or(
          isNull(githubStarsSubscriptions.leaseUntil),
          lt(githubStarsSubscriptions.leaseUntil, now),
        ),
      ),
    )
    .returning()
    .get();
  if (!subscription) return;
  const ownedLease = and(
    eq(githubStarsSubscriptions.id, id),
    eq(githubStarsSubscriptions.leaseUntil, leaseUntil),
  );
  const ownsLease = () =>
    Date.now() < leaseUntil.getTime() &&
    db
      .select({ id: githubStarsSubscriptions.id })
      .from(githubStarsSubscriptions)
      .where(ownedLease)
      .get();
  try {
    const page = await readPage(subscription.username, subscription.nextPage);
    const api = await getClient(subscription.userId);
    for (const repository of page.repositories) {
      // Stop stale jobs after disconnect/reconfiguration or lease expiry.
      if (!ownsLease()) return;
      const bookmark = await api.bookmarks.createBookmark({
        type: BookmarkTypes.LINK,
        url: `https://github.com/${repository.full_name}`,
        source: "import",
      });
      if (!ownsLease()) return;
      await api.lists.addToList({
        listId: subscription.listId,
        bookmarkId: bookmark.id,
      });
      if (!ownsLease()) return;
      if (subscription.importTopics && repository.topics.length) {
        await api.bookmarks.updateTags({
          bookmarkId: bookmark.id,
          attach: repository.topics.map((tagName) => ({ tagName })),
          detach: [],
        });
      }
    }
    db.update(githubStarsSubscriptions)
      .set({
        nextPage: page.hasNext ? subscription.nextPage + 1 : 1,
        nextRunAt: new Date(
          Date.now() + (page.hasNext ? 60_000 : 24 * 60 * 60_000),
        ),
        ...(page.hasNext ? {} : { lastSuccessfulSyncAt: new Date() }),
        lastError: null,
        rateLimitUntil: null,
        leaseUntil: null,
      })
      .where(ownedLease)
      .run();
  } catch (error) {
    db.update(githubStarsSubscriptions)
      .set({
        lastError:
          error instanceof GithubStarsError
            ? error.message
            : "Could not import this page. Check your destination list and bookmark quota; the page will be retried.",
        rateLimitUntil:
          error instanceof GithubStarsError && error.rateLimited
            ? error.retryAt
            : null,
        nextRunAt:
          error instanceof GithubStarsError
            ? error.retryAt
            : new Date(Date.now() + 60 * 60_000),
        leaseUntil: null,
      })
      .where(ownedLease)
      .run();
  }
}
