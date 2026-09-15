"use client";

import type { LucideIcon } from "lucide-react";
import BookmarkCard from "@/components/dashboard/bookmarks/BookmarkCard";
import { StyledBookmarkCard } from "@/components/dashboard/bookmarks/BookmarksGrid";
import { EmptyState, EmptyStateAction } from "@/components/ui/empty-state";
import { useQuery } from "@tanstack/react-query";

import type {
  ZGetBookmarksRequest,
  ZGetBookmarksResponse,
} from "@karakeep/shared/types/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";

import { BookmarkTriageActions } from "./BookmarkTriageActions";

export interface DashboardRowEmptyState {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
}

export default function DashboardRow({
  title,
  query,
  initialBookmarks,
  emptyState,
}: {
  title: string;
  query: Omit<ZGetBookmarksRequest, "sortOrder" | "includeContent">;
  initialBookmarks: ZGetBookmarksResponse;
  emptyState: DashboardRowEmptyState;
}) {
  const api = useTRPC();
  const { data } = useQuery(
    api.bookmarks.getBookmarks.queryOptions(
      { ...query, sortOrder: "desc", includeContent: false },
      { initialData: initialBookmarks },
    ),
  );

  const bookmarks = data.bookmarks;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium tracking-tight">{title}</h2>
      {bookmarks.length === 0 ? (
        <EmptyState
          className="p-6"
          icon={emptyState.icon}
          title={emptyState.title}
          description={emptyState.description}
          action={emptyState.action}
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {bookmarks.map((bookmark) => (
            <div key={bookmark.id} className="w-72 shrink-0">
              <StyledBookmarkCard className="mb-0">
                <BookmarkCard
                  bookmark={bookmark}
                  layoutOverride="grid"
                  triageActions={<BookmarkTriageActions bookmark={bookmark} />}
                />
              </StyledBookmarkCard>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
