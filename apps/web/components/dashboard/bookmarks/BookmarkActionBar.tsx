"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Maximize2 } from "lucide-react";
import { useSession } from "next-auth/react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import BookmarkOptions from "./BookmarkOptions";
import { FavouritedActionIcon } from "./icons";
import RemindMeButton from "./RemindMeButton";

export default function BookmarkActionBar({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  const { data: session } = useSession();
  const isOwner = session?.user?.id === bookmark.userId;

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
      {isOwner && <RemindMeButton bookmark={bookmark} />}
      <BookmarkOptions bookmark={bookmark} />
    </div>
  );
}
