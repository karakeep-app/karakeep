// TODO: Refactor the bookmark layout grid to be generic and allow to pass the bookmark component generically.
// This removes the need for handling the layout in this component.
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  bookmarkLayoutSwitch,
  useBookmarkLayout,
  useGridColumns,
} from "@/lib/userLocalSettings/bookmarksLayout";
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

function BookmarkCardSkeleton({ height }: { height: string }) {
  return (
    <div className="mb-4 border border-border bg-card p-4">
      <div className="space-y-3">
        <Skeleton className={`w-full ${height}`} />
        <div className="flex items-center space-x-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-4 w-3/4" />
      </div>
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

  const children = Array.from({ length: count }, (_, i) => (
    <BookmarkCardSkeleton
      key={i}
      height={bookmarkLayoutSwitch(layout, {
        masonry: "h-48",
        grid: "h-48",
        list: "h-32",
        compact: "h-4",
      })}
    />
  ));

  return bookmarkLayoutSwitch(layout, {
    masonry: (
      <Masonry className="flex gap-4" breakpointCols={breakpointConfig}>
        {children}
      </Masonry>
    ),
    grid: (
      <Masonry className="flex gap-4" breakpointCols={breakpointConfig}>
        {children}
      </Masonry>
    ),
    list: <div className="grid grid-cols-1">{children}</div>,
    compact: <div className="grid grid-cols-1">{children}</div>,
  });
}
