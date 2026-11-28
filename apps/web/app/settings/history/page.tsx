"use client";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { useTranslation } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
/** List the owner's retained deletion events and link to each item's read-only audit. */
export default function DeletedHistoryPage() {
  const api = useTRPC();
  const { t } = useTranslation();
  // Page through deletion events directly because the original item rows no longer exist.
  const query = useInfiniteQuery(
    api.bookmarks.getDeletedHistory.infiniteQueryOptions(
      {},
      { getNextPageParam: (p) => p.nextCursor },
    ),
  );
  return (
    <main className="space-y-4 p-5">
      <h1>{t("item_history.deleted")}</h1>
      <p>{t("item_history.retention")}</p>
      {query.isPending && <p>{t("item_history.loading")}</p>}
      {query.isError && (
        <Button onClick={() => query.refetch()}>
          {t("item_history.retry")}
        </Button>
      )}
      {query.data?.pages
        .flatMap((p) => p.events)
        .map((e) => (
          <div key={e.id}>
            <Link href={`/settings/history/${e.bookmarkId}`}>
              {e.title || e.bookmarkId}
            </Link>{" "}
            <time>{new Date(e.createdAt).toLocaleString()}</time>
          </div>
        ))}
      {query.data?.pages[0].events.length === 0 && (
        <p>{t("item_history.empty")}</p>
      )}
      {query.hasNextPage && (
        <Button onClick={() => query.fetchNextPage()}>
          {t("item_history.more")}
        </Button>
      )}
    </main>
  );
}
