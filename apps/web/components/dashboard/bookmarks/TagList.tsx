import Link from "next/link";
import { badgeVariants } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { CARD_TAG_CLASS } from "./icons";

export default function TagList({
  bookmark,
  loading,
  className,
}: {
  bookmark: ZBookmark;
  loading?: boolean;
  className?: string;
}) {
  const { data: session } = useSession();
  const isOwner = session?.user?.id === bookmark.userId;

  if (loading) {
    return (
      <div className="flex w-full flex-col justify-end space-y-2 p-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }
  return (
    <>
      {bookmark.tags.map((t) => (
        <div key={t.id} className={className}>
          {isOwner ? (
            <Link
              key={t.id}
              className={cn(
                badgeVariants({ variant: "secondary" }),
                CARD_TAG_CLASS,
                "hover:bg-accent hover:text-foreground",
                // 44px to tap on phones, without looking any bigger. The row of
                // tags doesn't clip vertically there, see CARD_TAG_ROW_CLASS.
                "relative max-sm:after:absolute max-sm:after:left-1/2 max-sm:after:top-1/2 max-sm:after:h-11 max-sm:after:w-full max-sm:after:min-w-11 max-sm:after:-translate-x-1/2 max-sm:after:-translate-y-1/2 max-sm:after:content-['']",
              )}
              href={`/dashboard/tags/${t.id}`}
              // A card's tab stops are its title and its menu
              tabIndex={-1}
            >
              {t.name}
            </Link>
          ) : (
            <span
              key={t.id}
              className={cn(
                badgeVariants({ variant: "secondary" }),
                CARD_TAG_CLASS,
              )}
            >
              {t.name}
            </span>
          )}
        </div>
      ))}
    </>
  );
}
