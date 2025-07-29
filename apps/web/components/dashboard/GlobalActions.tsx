"use client";

import BulkBookmarksAction from "@/components/dashboard/BulkBookmarksAction";
import SortOrderToggle from "@/components/dashboard/SortOrderToggle";
import ViewOptions from "@/components/dashboard/ViewOptions";

export default function GlobalActions() {
  return (
    <div className="flex min-w-max flex-wrap overflow-hidden">
      <ViewOptions />
      <SortOrderToggle />
      <BulkBookmarksAction />
    </div>
  );
}
