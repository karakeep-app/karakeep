"use client";

import BulkBookmarksAction from "@/components/dashboard/BulkBookmarksAction";
import SortOrderToggle from "@/components/dashboard/SortOrderToggle";
import ViewOptions from "@/components/dashboard/ViewOptions";
import { useInBookmarkGridStore } from "@/lib/store/useInBookmarkGridStore";

export default function GlobalActions() {
  const inBookmarkGrid = useInBookmarkGridStore(
    (state) => state.inBookmarkGrid,
  );
  return (
    <div className="flex min-w-max flex-wrap overflow-hidden">
      {inBookmarkGrid && <ViewOptions />}
      {inBookmarkGrid && <BulkBookmarksAction />}
      {inBookmarkGrid && <SortOrderToggle />}
    </div>
  );
}
