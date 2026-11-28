"use client";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";
/**
 * Shared owner-history view for item details and the deleted-item audit page.
 * Details start collapsed; standalone audit pages can request immediate loading.
 * Access is enforced by the backend, not by the visibility of this component.
 */
export default function BookmarkHistory({
  bookmarkId,
  initiallyOpen = false,
}: {
  bookmarkId: string;
  initiallyOpen?: boolean;
}) {
  const api = useTRPC();
  const { t } = useTranslation();
  const [open, setOpen] = useState(initiallyOpen);
  // Defer history requests until expanded and reuse React Query's cursor cache.
  const query = useInfiniteQuery(
    api.bookmarks.getHistory.infiniteQueryOptions(
      { bookmarkId },
      { enabled: open, getNextPageParam: (p) => p.nextCursor },
    ),
  );
  // Render historical values as escaped text inside expandable details. Old
  // notes and relationship metadata must never be interpreted as HTML.
  return (
    <section>
      <Button
        variant="ghost"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t("item_history.title")}
      </Button>
      {open && (
        <div className="space-y-3 text-sm">
          <p>{t("item_history.retention")}</p>
          {query.isPending && <p>{t("item_history.loading")}</p>}
          {query.isError && (
            <Button onClick={() => query.refetch()}>
              {t("item_history.retry")}
            </Button>
          )}
          {query.data?.pages
            .flatMap((p) => p.events)
            .map((event) => (
              <article key={event.id} className="rounded border p-3">
                <time>{new Date(event.createdAt).toLocaleString()}</time>
                <p>
                  {event.type === "deleted"
                    ? t("item_history.deleted")
                    : t("item_history.changed")}
                </p>
                <p className="text-muted-foreground">
                  {t(
                    event.actorKind !== "system"
                      ? "item_history.actor_user"
                      : "item_history.actor_system",
                  )}{" "}
                  {event.actorId}
                </p>
                {event.changes.map((change, i) => (
                  <details key={i}>
                    <summary>{change.field}</summary>
                    <pre className="whitespace-pre-wrap break-words">
                      {t("item_history.previous")}:{" "}
                      {JSON.stringify(change.oldValue, null, 2)}
                      {"\n"}
                      {t("item_history.current")}:{" "}
                      {JSON.stringify(change.newValue, null, 2)}
                    </pre>
                  </details>
                ))}
              </article>
            ))}
          {query.data?.pages[0].events.length === 0 && (
            <p>{t("item_history.empty")}</p>
          )}
          {query.hasNextPage && (
            <Button
              disabled={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              {t("item_history.more")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
