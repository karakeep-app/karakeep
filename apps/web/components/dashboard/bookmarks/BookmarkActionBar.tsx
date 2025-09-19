import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Maximize2 } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import BookmarkOptions from "./BookmarkOptions";
import { FavouritedActionIcon } from "./icons";

export default function BookmarkActionBar({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  return (
    <div className="flex text-gray-500">
      {bookmark.favourited && (
        <FavouritedActionIcon className="m-1 size-8 rounded p-1" favourited />
      )}
      <Link
        href={`/dashboard/preview/${bookmark.id}`}
        className={cn(buttonVariants({ variant: "ghost" }), "px-2")}
      >
        <Maximize2 size={16} />
      </Link>
      <BookmarkOptions bookmark={bookmark} />
    </div>
  );
}
