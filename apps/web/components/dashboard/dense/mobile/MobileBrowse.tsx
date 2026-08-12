"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EditListModal } from "@/components/dashboard/lists/EditListModal";
import {
  getDenseRowSource,
  getDenseRowTitle,
} from "@/lib/dense/bookmarkDisplay";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";
import { useTRPC } from "@karakeep/shared-react/trpc";

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-[10px] pb-[4px] pt-[10px]">
      <span className="font-k-mono text-k-fg-dim text-[10px] tracking-[0.08em]">
        {label}
      </span>
      <div className="border-k-border h-px flex-1" />
    </div>
  );
}

/**
 * The mobile browse() screen (design/Keepsake Mobile Designs.html, screen
 * 2d) — lists, tags and a "recently added" glance collapse onto one
 * screen rather than three tabs, per the design's own capture-screen note
 * ("Lists, tags and the grid view collapse into one browse surface rather
 * than three tabs") and the earlier call to fold Tags into this tab
 * instead of giving it a fifth slot (see MobileTabBar's doc comment).
 *
 * Scope boundary, not an oversight: this screen is the browse *overview*
 * only, matching what the design actually drew. Opening a list or a tag
 * from here (or the "All lists"/"All tags" links) lands on the existing
 * desktop list/tag detail pages, not yet mobile-styled — same boundary
 * Phase 3 already drew around `/dashboard/bookmarks`. Those pages remain
 * fully functional, just squeezed to phone width, until a later pass.
 */
export function MobileBrowse() {
  const api = useTRPC();
  const [newListOpen, setNewListOpen] = useState(false);

  const { data: listsData } = useBookmarkLists();
  const { data: listStats } = useQuery(api.lists.stats.queryOptions());
  const { data: tagsData } = useQuery(
    api.tags.list.queryOptions({ sortBy: "usage" }),
  );
  const { data: recentData } = useQuery(
    api.bookmarks.getBookmarks.queryOptions({
      archived: false,
      sortOrder: "desc",
      limit: 4,
      includeContent: false,
      useCursorV2: true,
    }),
  );

  // Every section reads its own count out of an inflight-vs-empty query, so
  // track loading centrally rather than letting each section's own "empty"
  // branch flash before the first real response lands.
  const isPending =
    listsData === undefined ||
    listStats === undefined ||
    tagsData === undefined;

  const topLevelLists = useMemo(
    () => (listsData?.data ?? []).filter((l) => !l.parentId),
    [listsData],
  );
  // Usage-sorted tags cloud, capped the same way the sidebar caps lists —
  // "All tags" is one tap away for the rest.
  const tags = (tagsData?.tags ?? []).slice(0, 24);
  const totalItems = topLevelLists.reduce(
    (sum, list) => sum + (listStats?.stats.get(list.id) ?? 0),
    0,
  );

  return (
    <div className="flex h-full flex-col sm:hidden">
      <div className="flex-none px-[16px] pb-[10px] pt-[14px]">
        <div className="flex items-baseline gap-[10px]">
          <h1 className="text-k-fg text-[22px] font-semibold tracking-[-0.02em]">
            Lists
          </h1>
          {!isPending && (
            <span className="font-k-mono text-k-fg-dim text-[10.5px]">
              {`// ${topLevelLists.length} · ${totalItems} items`}
            </span>
          )}
          <button
            type="button"
            aria-label="New list"
            onClick={() => setNewListOpen(true)}
            className="border-k-border bg-k-surface-1 text-k-fg-muted ml-auto flex size-[30px] flex-none items-center justify-center rounded-[9px] border"
          >
            <Plus size={15} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[16px] pb-[24px]">
        {isPending ? (
          <div className="grid grid-cols-2 gap-[9px]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="border-k-border bg-k-surface-1 flex h-[92px] flex-col gap-[20px] rounded-[12px] border p-[13px]"
              >
                <div className="bg-k-border size-[17px] rounded-[4px]" />
                <div className="flex flex-col gap-[6px]">
                  <div className="bg-k-border h-2.5 w-3/4 rounded-[3px]" />
                  <div className="bg-k-border h-2 w-1/3 rounded-[3px]" />
                </div>
              </div>
            ))}
          </div>
        ) : topLevelLists.length > 0 ? (
          <div className="grid grid-cols-2 gap-[9px]">
            {topLevelLists.map((list) => (
              <Link
                key={list.id}
                href={`/dashboard/lists/${list.id}`}
                className="border-k-border bg-k-surface-1 flex flex-col gap-[20px] rounded-[12px] border p-[13px]"
              >
                <span className="text-[17px]" aria-hidden>
                  {list.icon}
                </span>
                <span className="flex flex-col gap-[3px]">
                  <span className="text-k-fg truncate text-[13.5px] font-semibold">
                    {list.name}
                  </span>
                  <span className="font-k-mono text-k-fg-dim text-[10.5px]">
                    {(listStats?.stats.get(list.id) ?? 0).toLocaleString()}{" "}
                    items
                  </span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNewListOpen(true)}
            className="text-k-fg-dim border-k-border-dashed w-full rounded-[12px] border border-dashed py-[20px] text-center text-[12.5px]"
          >
            No lists yet — create one
          </button>
        )}
        {topLevelLists.length > 0 && (
          <Link
            href="/dashboard/lists"
            className="text-k-fg-dim/70 hover:text-k-fg-muted block pt-[9px] text-[11px]"
          >
            All lists
          </Link>
        )}

        {tags.length > 0 && (
          <>
            <SectionRule label="// tags" />
            <div className="flex flex-wrap gap-[7px]">
              {tags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/dashboard/tags/${tag.id}`}
                  className="border-k-border-soft text-k-fg-muted flex items-baseline gap-[6px] rounded-full border px-[12px] py-[5px] text-[12.5px]"
                >
                  {tag.name}
                  <span className="font-k-mono text-k-fg-dim text-[10px]">
                    {tag.numBookmarks}
                  </span>
                </Link>
              ))}
            </div>
            <Link
              href="/dashboard/tags"
              className="text-k-fg-dim/70 hover:text-k-fg-muted block pt-[9px] text-[11px]"
            >
              All tags
            </Link>
          </>
        )}

        {recentData && recentData.bookmarks.length > 0 && (
          <>
            <SectionRule label="// recently_added" />
            <div className="grid grid-cols-2 gap-[9px]">
              {recentData.bookmarks.map((bookmark) => (
                <Link
                  key={bookmark.id}
                  href={`/dashboard/preview/${bookmark.id}`}
                  className="border-k-border bg-k-surface-1 flex flex-col gap-[7px] rounded-[12px] border p-[12px]"
                >
                  {getDenseRowSource(bookmark) && (
                    <span className="font-k-mono text-k-fg-dim truncate text-[10px]">
                      {getDenseRowSource(bookmark)}
                    </span>
                  )}
                  <span className="text-k-fg line-clamp-2 text-[12.5px] font-semibold leading-[1.35]">
                    {getDenseRowTitle(bookmark)}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <EditListModal open={newListOpen} setOpen={setNewListOpen} />
    </div>
  );
}
