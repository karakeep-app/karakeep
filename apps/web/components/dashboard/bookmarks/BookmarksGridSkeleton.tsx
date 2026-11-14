// TODO: Refactor the bookmark layout grid to be generic and allow to pass the bookmark component generically.
// This removes the need for handling the layout in this component.
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  bookmarkLayoutSwitch,
  useBookmarkLayout,
  useGridColumns,
} from "@/lib/userLocalSettings/bookmarksLayout";
import { cn } from "@/lib/utils";
import tailwindConfig from "@/tailwind.config";
import Masonry from "react-masonry-css";
import resolveConfig from "tailwindcss/resolveConfig";

function getBreakpointConfig(userColumns: number) {
  const fullConfig = resolveConfig(tailwindConfig);

  const breakpointColumnsObj: { [key: number]: number; default: number } = {
    default: userColumns,
  };

  const lgColumns = Math.max(1, Math.min(userColumns, userColumns - 1));
  const mdColumns = Math.max(1, Math.min(userColumns, 2));
  const smColumns = 1;

  breakpointColumnsObj[parseInt(fullConfig.theme.screens.lg)] = lgColumns;
  breakpointColumnsObj[parseInt(fullConfig.theme.screens.md)] = mdColumns;
  breakpointColumnsObj[parseInt(fullConfig.theme.screens.sm)] = smColumns;
  return breakpointColumnsObj;
}

function GridCardSkeleton({ imageHeight }: { imageHeight: string }) {
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-card">
      <Skeleton className={cn("w-full rounded-none", imageHeight)} />
      <div className="space-y-3 p-3">
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-1">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

function ListRowSkeleton() {
  return (
    <div className="mb-3 flex gap-4 rounded-lg border border-border bg-card p-3 sm:mb-2">
      <Skeleton className="size-20 shrink-0 rounded-md sm:size-24" />
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 py-1">
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-1">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

function CompactRowSkeleton() {
  return (
    <div className="flex h-10 items-center gap-2 px-3">
      <Skeleton className="size-4 shrink-0 rounded-sm" />
      <Skeleton className="h-3.5 flex-1" />
      <Skeleton className="hidden h-3 w-24 sm:block" />
    </div>
  );
}

export default function BookmarksGridSkeleton({
  count = 12,
}: {
  count?: number;
}) {
  const layout = useBookmarkLayout();
  const gridColumns = useGridColumns();
  const breakpointConfig = useMemo(
    () => getBreakpointConfig(gridColumns),
    [gridColumns],
  );
  const items = Array.from({ length: count }, (_, i) => i);

  return bookmarkLayoutSwitch(layout, {
    masonry: (
      <Masonry
        className="-ml-4 flex w-auto"
        columnClassName="pl-4 [container-type:inline-size]"
        breakpointCols={breakpointConfig}
      >
        {items.map((i) => (
          <GridCardSkeleton
            key={i}
            imageHeight="h-40 sm:h-[clamp(7rem,50cqw,14rem)]"
          />
        ))}
      </Masonry>
    ),
    grid: (
      <Masonry
        className="-ml-4 flex w-auto"
        columnClassName="pl-4 [container-type:inline-size]"
        breakpointCols={breakpointConfig}
      >
        {items.map((i) => (
          <GridCardSkeleton
            key={i}
            imageHeight="h-40 sm:h-[clamp(7rem,50cqw,14rem)]"
          />
        ))}
      </Masonry>
    ),
    list: (
      <div className="grid grid-cols-1">
        {items.map((i) => (
          <ListRowSkeleton key={i} />
        ))}
      </div>
    ),
    compact: (
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {items.map((i) => (
          <CompactRowSkeleton key={i} />
        ))}
      </div>
    ),
  });
}
